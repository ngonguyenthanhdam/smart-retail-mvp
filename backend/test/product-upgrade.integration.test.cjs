const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { readdir, mkdtemp, mkdir, rm } = require('node:fs/promises');
const { resolve } = require('node:path');
const sharp = require('sharp');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');

test('Product defaults, assignment lifecycle, strict RBAC and real image uploads', async (t) => {
  await mkdir(resolve(__dirname, '../.local'), { recursive: true });
  const directory = await mkdtemp(resolve(__dirname, '../.local/product-upload-test-'));
  process.env.PRODUCT_UPLOAD_DIR = directory;
  const f = await catalogFixture(t);
  t.after(async () => { if (!directory.startsWith(resolve(__dirname, '../.local') + require('node:path').sep)) throw new Error('Unsafe cleanup path'); await rm(directory, { recursive: true, force: true }); delete process.env.PRODUCT_UPLOAD_DIR; });
  const { ADMIN: admin, STORE_MANAGER: manager, STAFF: staff } = f.cookies;
  const unit = await f.fixture('unit', { code: f.code(), name: 'Piece' });
  const category = await f.fixture('category', { code: f.code(), name: 'Catalog', createdAt: new Date() });
  const values = (extra = {}) => ({ sku: f.code(), name: 'Shared product', categoryId: category.id,
    baseUnitId: unit.id, purchaseUnitId: unit.id, defaultCost: '4.25',
    defaultSellingPrice: '12.50', defaultMinStockLevel: '2.5', defaultSafetyStock: '6', ...extra });
  const create = (extra) => f.create('/products', 'product', admin, values(extra));
  const batch = async (productId, extra = {}, cookie = admin) => {
    const response = await f.request('/store-products/batch', cookie, 'POST', { productId, ...extra });
    return { status: response.status, body: await response.json() };
  };
  const settings = (productId) => f.prisma.storeProduct.findMany({ where: { productId }, orderBy: { locationId: 'asc' } });
  let manual;
  let global;
  let storeC;

  await t.test('Create without image initializes selected stores and never creates inventory', async () => {
    const before = await f.prisma.inventoryLot.count();
    const result = await create({ storeIds: [f.storeA.id, f.storeB.id] });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    manual = result.body;
    assert.equal(manual.imagePath, null);
    assert.equal(manual.defaultSellingPrice, '12.5');
    assert.equal(manual.defaultMinStockLevel, '2.5');
    assert.equal(manual.defaultSafetyStock, '6');
    const rows = await settings(manual.id);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((s) => s.sellingPrice.eq('12.5') && s.minStockLevel.eq('2.5') && s.safetyStock.eq(6)));
    assert.equal(await f.prisma.inventoryLot.count(), before);
    const created = await f.create('/locations', 'location', admin, { code: f.code(), name: 'New store C', locationType: 'STORE' });
    assert.equal(created.status, 201);
    storeC = created.body;
    assert.equal((await settings(manual.id)).length, 2);
  });
  await t.test('Global products cover current, new and reactivated stores, preserving customized settings', async () => {
    const result = await create({ isGlobalAllStores: true });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    global = result.body;
    const activeStores = await f.prisma.location.count({ where: { locationType: 'STORE', isActive: true, deletedAt: null } });
    assert.equal((await settings(global.id)).length, activeStores);
    const created = await f.create('/locations', 'location', admin, { code: f.code(), name: 'New store D', locationType: 'STORE' });
    assert.equal(created.status, 201);
    const d = created.body;
    const row = (await settings(global.id)).find((s) => s.locationId === d.id);
    assert.ok(row);
    assert.equal(await f.prisma.storeProduct.count({ where: { productId: manual.id, locationId: d.id } }), 0);
    await f.request(`/store-products/${row.id}`, admin, 'PATCH', { sellingPrice: '77', safetyStock: '9', minStockLevel: '4' });
    assert.equal((await f.request(`/locations/${d.id}`, admin, 'PATCH', { isActive: false })).status, 200);
    await f.prisma.storeProduct.update({ where: { id: row.id }, data: { isActive: false } });
    assert.equal((await f.request(`/locations/${d.id}`, admin, 'PATCH', { isActive: true })).status, 200);
    const after = await f.prisma.storeProduct.findUnique({ where: { id: row.id } });
    assert.equal(after.isActive, true);
    assert.equal(after.sellingPrice.toString(), '77');
    assert.equal(after.safetyStock.toString(), '9');
    assert.equal(after.minStockLevel.toString(), '4');
    const inactive = await f.create('/locations', 'location', admin, { code: f.code(), name: 'Inactive store', locationType: 'STORE', isActive: false });
    assert.equal(await f.prisma.storeProduct.count({ where: { locationId: inactive.body.id } }), 0);
    assert.equal((await f.request(`/locations/${inactive.body.id}`, admin, 'PATCH', { isActive: true })).status, 200);
    assert.equal(await f.prisma.storeProduct.count({ where: { locationId: inactive.body.id, productId: global.id } }), 1);
  });
  await t.test('Defaults update preserves store overrides; repeat and concurrent assignments are idempotent', async () => {
    const row = (await settings(manual.id)).find((s) => s.locationId === f.storeA.id);
    assert.equal((await f.request(`/store-products/${row.id}`, manager, 'PATCH', { sellingPrice: '30', safetyStock: '8', minStockLevel: '3' })).status, 200);
    assert.equal((await f.request(`/products/${manual.id}`, admin, 'PATCH', { defaultSellingPrice: '20', defaultSafetyStock: '10' })).status, 200);
    const ids = [f.storeA.id, f.storeB.id, storeC.id];
    const results = await Promise.all(Array.from({ length: 4 }, () => batch(manual.id, { storeIds: ids })));
    assert.ok(results.every((r) => r.status === 201), JSON.stringify(results));
    const rows = await settings(manual.id);
    assert.equal(rows.length, 3);
    assert.equal(rows.find((s) => s.id === row.id).sellingPrice.toString(), '30');
    assert.equal(rows.find((s) => s.locationId === storeC.id).sellingPrice.toString(), '20');
    assert.equal((await batch(manual.id, { storeIds: ids, applyDefaultsToExisting: true })).status, 201);
    assert.ok((await settings(manual.id)).every((s) => s.sellingPrice.eq(20) && s.safetyStock.eq(10)));
  });
  await t.test('Concurrent single-store assignments and global-product/store creation stay consistent', async () => {
    const p = await create({});
    assert.equal(p.status, 201);
    const payload = { productId: p.body.id, locationId: f.storeA.id, sellingPrice: '19', minStockLevel: '1', safetyStock: '4' };
    const responses = await Promise.all(Array.from({ length: 3 }, () => f.request('/store-products', admin, 'POST', payload)));
    assert.deepEqual(responses.map((r) => r.status), [201, 201, 201]);
    assert.equal((await settings(p.body.id)).length, 1);
    const [createdProduct, createdStore] = await Promise.all([
      create({ isGlobalAllStores: true }),
      f.create('/locations', 'location', admin, { code: f.code(), name: 'Concurrent store', locationType: 'STORE' }),
    ]);
    assert.equal(createdProduct.status, 201, JSON.stringify(createdProduct.body));
    assert.equal(createdStore.status, 201, JSON.stringify(createdStore.body));
    assert.equal(await f.prisma.storeProduct.count({ where: { productId: createdProduct.body.id, locationId: createdStore.body.id, isActive: true } }), 1);
  });
  await t.test('Single-store assignment uses master defaults when omitted and retains existing overrides on repeat', async () => {
    const p = await create({});
    assert.equal(p.status, 201);
    const payload = { productId: p.body.id, locationId: f.storeA.id };
    const created = await f.request('/store-products', admin, 'POST', payload);
    assert.equal(created.status, 201);
    const row = await created.json();
    assert.equal(row.sellingPrice, '12.5');
    assert.equal(row.minStockLevel, '2.5');
    assert.equal(row.safetyStock, '6');
    assert.equal((await f.request(`/store-products/${row.id}`, manager, 'PATCH', { sellingPrice: 30 })).status, 200);
    const repeated = await f.request('/store-products', admin, 'POST', { ...payload, sellingPrice: 10 });
    assert.equal(repeated.status, 201);
    assert.equal((await repeated.json()).sellingPrice, '30');
    assert.equal((await settings(p.body.id)).length, 1);
  });
  await t.test('Manager field whitelist and location scope; staff cannot write and never reads cost', async () => {
    const rows = await settings(manual.id);
    const own = rows.find((s) => s.locationId === f.storeA.id);
    const other = rows.find((s) => s.locationId === f.storeB.id);
    for (const cookie of [manager, staff]) {
      assert.equal((await f.request('/products', cookie, 'POST', values())).status, 403);
      assert.equal((await f.request(`/products/${manual.id}`, cookie, 'PATCH', { name: 'Changed' })).status, 403);
      assert.equal((await batch(manual.id, { storeIds: [f.storeA.id] }, cookie)).status, 403);
      assert.equal((await f.request('/store-products', cookie, 'POST', { productId: manual.id, locationId: f.storeA.id, sellingPrice: 5 })).status, 403);
    }
    for (const body of [{ isActive: false }, { locationId: f.storeB.id }, { productId: global.id }, { isGlobalAllStores: true }, { confirmDiscontinue: true }])
      assert.ok([400, 403].includes((await f.request(`/store-products/${own.id}`, manager, 'PATCH', body)).status));
    assert.equal((await f.request(`/store-products/${other.id}`, manager, 'PATCH', { sellingPrice: 5 })).status, 404);
    assert.equal((await f.request(`/store-products/${own.id}`, staff, 'PATCH', { sellingPrice: 5 })).status, 403);
    const visible = await (await f.request('/store-products', staff)).json();
    assert.ok(visible.items.every((r) => r.locationId === f.storeA.id && !('defaultCost' in r.product)));
    for (const cookie of [admin, manager]) assert.equal((await f.request('/sales', cookie, 'POST', {})).status, 403);
  });
  await t.test('Global to selected requires stock confirmation, preserves lots/sales and blocks sale APIs', async () => {
    const lot = await f.fixture('inventoryLot', { locationId: f.storeA.id, productId: global.id, quantityOnHand: 5, unitCost: 4,
      receivedDate: new Date(), createdAt: new Date() });
    const sale = await f.create('/sales', 'sale', staff, { items: [{ productId: global.id, quantity: 1 }] });
    assert.equal(sale.status, 201);
    const payload = { storeIds: [f.storeB.id], isGlobalAllStores: false };
    const rejected = await batch(global.id, payload);
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.code, 'STOCK_REMAINS_CONFIRMATION_REQUIRED');
    assert.equal(rejected.body.stock[0].quantity, '4');
    assert.equal((await f.prisma.product.findUnique({ where: { id: global.id } })).isGlobalAllStores, true);
    assert.equal((await batch(global.id, { ...payload, confirmDiscontinue: true })).status, 201);
    assert.equal((await f.prisma.inventoryLot.findUnique({ where: { id: lot.id } })).quantityOnHand.toString(), '4');
    assert.equal((await f.request(`/sales/${sale.body.id}`, manager)).status, 200);
    assert.equal((await f.request('/sales', staff, 'POST', { items: [{ productId: global.id, quantity: 1 }] })).status, 400);
    const inventory = await (await f.request(`/inventory?productId=${global.id}`, manager)).json();
    assert.equal(Number(inventory.items[0].currentQuantity), 4);
    assert.equal(inventory.items[0].isActive, false);
    const old = (await settings(global.id)).find((s) => s.locationId === f.storeA.id);
    await f.request(`/store-products/${old.id}`, manager, 'PATCH', { sellingPrice: '45' });
    assert.equal((await batch(global.id, { storeIds: [f.storeA.id, f.storeB.id] })).status, 201);
    assert.equal((await settings(global.id)).find((s) => s.id === old.id).sellingPrice.toString(), '45');
  });
  await t.test('Legacy price required for new assignments; invalid targets and defaults roll back atomically', async () => {
    const legacy = await f.fixture('product', { sku: f.code(), name: 'Legacy', categoryId: category.id, baseUnitId: unit.id, purchaseUnitId: unit.id, createdAt: new Date() });
    assert.equal((await batch(legacy.id, { storeIds: [f.storeA.id] })).status, 400);
    assert.equal((await batch(legacy.id, { isGlobalAllStores: true })).status, 400);
    assert.equal((await f.request(`/products/${legacy.id}`, admin, 'PATCH', { isGlobalAllStores: true })).status, 400);
    assert.equal((await settings(legacy.id)).length, 0);
    assert.equal((await f.request(`/products/${legacy.id}`, admin, 'PATCH', { defaultSellingPrice: 15 })).status, 200);
    assert.equal((await batch(legacy.id, { storeIds: [f.storeA.id] })).status, 201);
    const before = await settings(manual.id);
    assert.equal((await batch(manual.id, { storeIds: [randomUUID()] })).status, 400);
    assert.deepEqual(await settings(manual.id), before);
    for (const extra of [{ defaultSellingPrice: 0 }, { defaultSellingPrice: -1 }, { defaultMinStockLevel: -1 }, { defaultSafetyStock: '1.00001' }])
      assert.equal((await create(extra)).status, 400);
  });
  await t.test('Outstanding purchase remains receivable after master and store discontinuation', async () => {
    const order = await f.create('/purchases', 'purchaseOrder', manager, { orderedAt: new Date().toISOString(), items: [{ productId: manual.id, purchaseQuantity: 2, unitCost: 5 }] });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    assert.equal((await f.request(`/products/${manual.id}`, admin, 'PATCH', { isActive: false })).status, 200);
    const receipt = await f.request(`/purchases/${order.body.id}/receive`, manager, 'POST', {});
    assert.equal(receipt.status, 201, JSON.stringify(await receipt.json()));
    assert.equal((await f.request('/sales', staff, 'POST', { items: [{ productId: manual.id, quantity: 1 }] })).status, 400);
  });
  await t.test('PNG/JPEG/WebP upload, shared images, failure cleanup, rename stability and static paths', async () => {
    const base = await f.app.getUrl();
    const upload = async (path, bytes, mime, filename, cookie = admin, data) => {
      const form = new FormData();
      form.set('image', new Blob([bytes], { type: mime }), filename);
      if (data) form.set('data', JSON.stringify(data));
      return fetch(`${base}${path}`, { method: 'POST', headers: { Origin: process.env.FRONTEND_ORIGIN, Cookie: cookie }, body: form });
    };
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).png().toBuffer();
    const created = await upload('/products', png, 'image/png', '../../image.png', admin, values({ storeIds: [f.storeA.id, f.storeB.id] }));
    assert.equal(created.status, 201);
    const p = await created.json(); f.ids.product.push(p.id);
    assert.match(p.imagePath, /^\/products\/images\/[0-9a-f-]+\.png$/);
    for (const cookie of [admin, manager, staff]) {
      const served = await f.request(p.imagePath, cookie);
      assert.equal(served.status, 200); assert.equal(served.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
    }
    assert.equal((await f.request(`/products/${p.id}`, admin, 'PATCH', { name: 'Renamed' })).status, 200);
    assert.equal((await f.prisma.product.findUnique({ where: { id: p.id } })).imagePath, p.imagePath);
    for (const [format, mime, extension] of [['jpeg', 'image/jpeg', 'jpg'], ['webp', 'image/webp', 'webp']]) {
      const bytes = await sharp(png).toFormat(format).toBuffer();
      const response = await upload(`/products/${p.id}/image`, bytes, mime, `replacement.${extension}`);
      assert.equal(response.status, 201);
      const updated = await response.json();
      assert.ok(updated.imagePath.endsWith(`.${extension}`));
      assert.deepEqual(Buffer.from(await (await f.request(updated.imagePath, staff)).arrayBuffer()), bytes);
    }
    for (const cookie of [manager, staff]) assert.equal((await upload(`/products/${p.id}/image`, png, 'image/png', 'photo.png', cookie)).status, 403);
    for (const [bytes, mime, name] of [[Buffer.from('<svg/>'), 'image/png', 'a.png'], [png.subarray(0, 30), 'image/png', 'a.png'], [png, 'image/jpeg', 'a.jpg'], [png, 'image/png', 'a.svg']])
      assert.equal((await upload(`/products/${p.id}/image`, bytes, mime, name)).status, 400);
    assert.equal((await upload(`/products/${p.id}/image`, Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png', 'large.png')).status, 413);
    const files = await readdir(directory);
    assert.equal((await upload('/products', png, 'image/png', 'photo.png', admin, values({ sku: p.sku }))).status, 409);
    assert.deepEqual(await readdir(directory), files, 'Failed DB write removes only its uncommitted image');
    for (const path of ['/assets/products/fish.png', '/assets/products/milk.JPG', '/assets/products/rice.webp'])
      assert.equal((await f.request(`/products/${p.id}`, admin, 'PATCH', { imagePath: path })).status, 200);
    for (const path of ['/assets/products/../x.png', '/products/images/forged.png', 'https://example.com/image.png'])
      assert.equal((await f.request(`/products/${p.id}`, admin, 'PATCH', { imagePath: path })).status, 400);
  });
});
