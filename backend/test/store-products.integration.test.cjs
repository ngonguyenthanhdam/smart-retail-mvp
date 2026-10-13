const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
test('Store configuration scope and cost visibility', async (t) => {
  const f = await catalogFixture(t); const { ADMIN: admin, STORE_MANAGER: manager, STAFF: staff } = f.cookies;
  const category = await f.fixture('category', { code: f.code(), name: 'Food', createdAt: new Date() });
  const unit = await f.fixture('unit', { code: f.code(), name: 'Piece' });
  async function product() { return f.fixture('product', { sku: f.code(), name: 'Food product', categoryId: category.id, baseUnitId: unit.id, purchaseUnitId: unit.id, defaultCost: '4.25', createdAt: new Date() }); }
  const p = await product(); const other = await product();
  const values = (extra = {}) => ({ productId: p.id, sellingPrice: '8.50', safetyStock: '5.125', minStockLevel: '2', ...extra });
  let own, away;
  await t.test('Admin configures any store; manager creates in own inferred store', async () => {
    let r = await f.create('/store-products', 'storeProduct', admin, values({ locationId: f.storeB.id })); assert.equal(r.status, 201); away = r.body;
    r = await f.create('/store-products', 'storeProduct', manager, values()); assert.equal(r.status, 201); own = r.body;
    assert.equal(own.locationId, f.storeA.id); assert.equal(own.product.defaultCost, '4.25');
    assert.equal((await f.create('/store-products', 'storeProduct', admin, values({ locationId: f.storeA.id }))).status, 409);
  });
  await t.test('Manager cannot request/create/update another store; staff cannot write', async () => {
    assert.equal((await f.request(`/store-products?locationId=${f.storeB.id}`, manager)).status, 403);
    assert.equal((await f.create('/store-products', 'storeProduct', manager, values({ locationId: f.storeB.id }))).status, 403);
    assert.equal((await f.request(`/store-products/${away.id}`, manager, 'PATCH', { sellingPrice: 1 })).status, 404);
    assert.equal((await f.request(`/store-products/${own.id}`, manager, 'PATCH', { sellingPrice: '9.10' })).status, 200);
    assert.equal((await f.request(`/store-products/${own.id}`, manager, 'PATCH', { locationId: f.storeB.id })).status, 400);
    assert.equal((await f.request('/store-products', staff, 'POST', values())).status, 403);
    assert.equal((await f.request(`/store-products/${own.id}`, staff, 'PATCH', { isActive: false })).status, 403);
  });
  await t.test('Own-store reads include manager costs and omit staff costs', async () => {
    const m = await (await f.request('/store-products', manager)).json(); assert.ok(m.items.every((r) => r.locationId === f.storeA.id)); assert.equal(m.items[0].product.defaultCost, '4.25');
    const s = await (await f.request('/store-products', staff)).json(); assert.ok(s.items.every((r) => r.locationId === f.storeA.id)); assert.equal('defaultCost' in s.items[0].product, false);
    const staffProduct = await (await f.request(`/products/${p.id}`, staff)).json(); assert.equal('defaultCost' in staffProduct, false);
    assert.equal((await f.request(`/products/${other.id}`, manager)).status, 404);
    const available = await (await f.request('/products?available=true', manager)).json(); assert.ok(available.items.every((r) => !('defaultCost' in r)));
    assert.equal((await f.request('/products?available=true', staff)).status, 403);
  });
  await t.test('Warehouse pricing, inactive products, negatives and excessive precision rejected', async () => {
    const warehouse = await f.fixture('location', { code: f.code(), name: 'Warehouse', locationType: 'CENTRAL_WAREHOUSE', createdAt: new Date() });
    assert.equal((await f.create('/store-products', 'storeProduct', admin, values({ locationId: warehouse.id }))).status, 400);
    await f.prisma.product.update({ where: { id: other.id }, data: { isActive: false } });
    assert.equal((await f.create('/store-products', 'storeProduct', manager, values({ productId: other.id }))).status, 400);
    for (const invalid of [{ sellingPrice: -1 }, { safetyStock: -1 }, { minStockLevel: -1 }, { sellingPrice: '1.001' }, { safetyStock: '1.00001' }]) assert.equal((await f.request(`/store-products/${own.id}`, manager, 'PATCH', invalid)).status, 400);
    assert.equal((await f.request(`/locations/${f.storeB.id}`, admin, 'PATCH', { locationType: 'CENTRAL_WAREHOUSE' })).status, 409);
  });
  await t.test('Deactivation hides product from staff while manager can still edit', async () => {
    assert.equal((await f.request(`/store-products/${own.id}`, manager, 'PATCH', { isActive: false })).status, 200);
    const rows = await (await f.request('/store-products', staff)).json(); assert.equal(rows.total, 0);
    assert.equal((await f.request(`/products/${p.id}`, staff)).status, 404);
    assert.equal((await f.request(`/products/${p.id}`, manager)).status, 200);
    assert.equal((await f.request(`/store-products/${own.id}`, admin, 'DELETE')).status, 404);
  });
});
