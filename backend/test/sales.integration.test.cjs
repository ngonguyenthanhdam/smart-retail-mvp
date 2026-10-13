const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
const { businessDate, addDays } = require('../dist/src/inventory/expiry.js');

test('Atomic sales, FEFO/FIFO and historical pricing', async (t) => {
  const f = await catalogFixture(t); const { ADMIN: admin, STORE_MANAGER: manager, STAFF: staff } = f.cookies;
  const category = await f.fixture('category', { code: f.code(), name: 'Sales goods', createdAt: new Date() });
  const unit = await f.fixture('unit', { code: f.code(), name: 'Piece' }); const today = businessDate();
  async function product(trackExpiry = false, sellingPrice = '10', locationId = f.storeA.id) {
    const row = await f.fixture('product', { sku: f.code(), name: f.code(), categoryId: category.id, baseUnitId: unit.id, purchaseUnitId: unit.id, trackExpiry, createdAt: new Date() });
    await f.fixture('storeProduct', { locationId, productId: row.id, sellingPrice }); return row;
  }
  const lot = (p, qty, cost = '3', received = -1, expiry = null, locationId = f.storeA.id) => f.fixture('inventoryLot', { locationId, productId: p.id, lotNumber: f.code(), quantityOnHand: qty, unitCost: cost, receivedDate: new Date(addDays(today, received)), expiryDate: expiry === null ? null : new Date(addDays(today, expiry)), createdAt: new Date() });
  const payload = (p, quantity = '1', discountAmount = '0', locationId = f.storeA.id) => ({ locationId, discountAmount, items: [{ productId: p.id, quantity }] });
  const sell = async (body, cookie = staff) => f.create('/sales', 'sale', cookie, body);
  const remaining = async (l) => Number((await f.prisma.inventoryLot.findUnique({ where: { id: l.id } })).quantityOnHand);

  await t.test('Staff sale consumes multiple FEFO lots, excludes expired/undated lots and stores rounded COGS', async () => {
    const p = await product(true, '12.50');
    const later = await lot(p, '5', '5', -10, 10); const sooner = await lot(p, '2', '3', -1, 0);
    const expired = await lot(p, '100', '1', -20, -1); const undated = await lot(p, '100', '1', -30);
    const r = await sell(payload(p, '3')); assert.equal(r.status, 201); assert.equal(r.body.status, 'COMPLETED');
    assert.equal(r.body.subtotal, '37.5'); assert.equal(r.body.discountAmount, '0'); assert.equal(r.body.totalAmount, '37.5'); assert.equal(r.body.items[0].discountAmount, '0');
    assert.equal('costOfGoodsSold' in r.body.items[0], false); assert.equal(JSON.stringify(r.body).includes('unitCost'), false);
    assert.equal(await remaining(sooner), 0); assert.equal(await remaining(later), 4); assert.equal(await remaining(expired), 100); assert.equal(await remaining(undated), 100);
    const detail = await (await f.request(`/sales/${r.body.id}`, manager)).json(); assert.equal(detail.items[0].costOfGoodsSold, '11');
    const inventory = await (await f.request(`/inventory?productId=${p.id}`, manager)).json(); assert.equal(Number(inventory.items[0].currentQuantity), 204);
    assert.equal(Number(inventory.items[0].sellableQuantity), 4);
  });
  await t.test('FIFO uses received date, excludes expired lots even on untracked products', async () => {
    const p = await product(); const newest = await lot(p, 5, 8, -1, 1); const oldest = await lot(p, 2, 2, -5, 20); const expired = await lot(p, 100, 1, -10, -1);
    const r = await sell(payload(p, '3'), manager); assert.equal(r.status, 201); assert.equal(r.body.items[0].costOfGoodsSold, '12');
    assert.equal(await remaining(oldest), 0); assert.equal(await remaining(newest), 4); assert.equal(await remaining(expired), 100);
  });
  await t.test('Fractional quantities, line rounding and full invoice discount are supported', async () => {
    const p = await product(false, '1.01'); await lot(p, '2', '0.99');
    const r = await sell(payload(p, '0.5', '0.51'), manager); assert.equal(r.status, 201); assert.equal(r.body.subtotal, '0.51'); assert.equal(r.body.totalAmount, '0'); assert.equal(r.body.items[0].costOfGoodsSold, '0.5');
  });
  await t.test('Historical sale price/COGS stay fixed after store prices and lot costs change', async () => {
    const p = await product(); const l = await lot(p, 5, 3);
    const r = await sell(payload(p), manager); assert.equal(r.status, 201);
    await f.prisma.storeProduct.updateMany({ where: { productId: p.id }, data: { sellingPrice: 99 } });
    await f.prisma.inventoryLot.update({ where: { id: l.id }, data: { unitCost: 88 } });
    const saved = await (await f.request(`/sales/${r.body.id}`, manager)).json(); assert.equal(saved.items[0].unitPrice, '10'); assert.equal(saved.items[0].costOfGoodsSold, '3');
  });
  await t.test('Insufficient later product rolls back earlier consumption and creates no invoice', async () => {
    const p1 = await product(); const p2 = await product(); const ordered = [p1, p2].sort((a, b) => a.id.localeCompare(b.id));
    const first = await lot(ordered[0], 2); await lot(ordered[1], 1);
    const count = await f.prisma.sale.count(); const r = await sell({ ...payload(p1), items: ordered.map((p) => ({ productId: p.id, quantity: '2' })) });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'INSUFFICIENT_STOCK'); assert.equal(await remaining(first), 2); assert.equal(await f.prisma.sale.count(), count);
  });
  await t.test('Only expired stock or no stock cannot be sold', async () => {
    const p = await product(true); const expired = await lot(p, 10, 3, -5, -1);
    const r = await sell(payload(p)); assert.equal(r.status, 409); assert.equal(r.body.code, 'INSUFFICIENT_STOCK'); assert.equal(await remaining(expired), 10);
    assert.equal((await sell(payload(await product()))).status, 409);
  });
  await t.test('Concurrent last-stock sales complete once, never oversell or leave partial invoices', async () => {
    const p = await product(); const l = await lot(p, 1); const count = await f.prisma.sale.count();
    const results = await Promise.all([sell(payload(p)), sell(payload(p))]); assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]); assert.equal(await remaining(l), 0);
    assert.equal(await f.prisma.sale.count(), count + 1); assert.equal(await f.prisma.saleItem.count({ where: { productId: p.id } }), 1);
  });
  await t.test('Admin may select a store; managers/staff cannot choose other stores or warehouse', async () => {
    const p = await product(false, '10', f.storeB.id); const l = await lot(p, 5, 3, -1, null, f.storeB.id);
    for (const cookie of [manager, staff]) assert.equal((await sell(payload(p, '1', '0', f.storeB.id), cookie)).status, 403);
    assert.equal((await sell(payload(p, '1', '0', f.storeB.id), admin)).status, 201); assert.equal(await remaining(l), 4);
    assert.equal((await sell({ items: [{ productId: p.id, quantity: '1' }] }, admin)).status, 400);
    const warehouse = await f.fixture('location', { code: f.code(), name: 'Warehouse', locationType: 'CENTRAL_WAREHOUSE', createdAt: new Date() });
    assert.equal((await sell(payload(p, '1', '0', warehouse.id), admin)).status, 400);
  });
  await t.test('Unconfigured/inactive products, inactive settings and inactive stores are rejected', async () => {
    const p = await product(); await lot(p, 10);
    await f.prisma.storeProduct.updateMany({ where: { productId: p.id }, data: { isActive: false } });
    assert.equal((await sell(payload(p))).body.code, 'PRODUCT_NOT_AVAILABLE_AT_STORE');
    await f.prisma.storeProduct.updateMany({ where: { productId: p.id }, data: { isActive: true } }); await f.prisma.product.update({ where: { id: p.id }, data: { isActive: false } });
    assert.equal((await sell(payload(p))).body.code, 'PRODUCT_NOT_AVAILABLE_AT_STORE');
    assert.equal((await sell(payload({ id: randomUUID() }))).body.code, 'PRODUCT_NOT_AVAILABLE_AT_STORE');
    await f.prisma.location.update({ where: { id: f.storeB.id }, data: { isActive: false } }); assert.equal((await sell(payload(p, '1', '0', f.storeB.id), admin)).status, 400);
  });
  await t.test('Reject client prices, item discounts, duplicate lines, invalid quantities and excessive invoice discounts', async () => {
    const p = await product(); const l = await lot(p, 10); const base = payload(p);
    const invalid = [{ ...base, status: 'VOIDED' }, { ...base, subtotal: '1' }, { ...base, items: [] }, { ...base, discountAmount: '10.01' }, { ...base, discountAmount: '-1' }, { ...base, items: [...base.items, ...base.items] }];
    for (const change of [{ quantity: '0' }, { quantity: '-1' }, { quantity: '1.00001' }, { unitPrice: '1' }, { discountAmount: '1' }, { costOfGoodsSold: '1' }]) invalid.push({ ...base, items: [{ ...base.items[0], ...change }] });
    for (const body of invalid) assert.equal((await sell(body)).status, 400);
    assert.equal(await remaining(l), 10);
  });
  await t.test('Only managers authorize manual discounts; rejected staff checkout leaves stock unchanged', async () => {
    const p = await product(); const l = await lot(p, 3);
    const rejected = await sell(payload(p, '1', '5'));
    assert.equal(rejected.status, 403); assert.equal(rejected.body.code, 'DISCOUNT_REQUIRES_MANAGER');
    assert.equal(await remaining(l), 3);
    assert.equal((await sell(payload(p, '1', '5'), manager)).body.totalAmount, '5');
  });
  await t.test('Counted units reject fractions while weighed units retain decimal quantities', async () => {
    const counted = await f.fixture('unit', { code: f.code(), name: 'Bó', allowFraction: false });
    const p = await product(); await f.prisma.product.update({ where: { id: p.id }, data: { baseUnitId: counted.id } });
    const l = await lot(p, 3);
    const rejected = await sell(payload(p, '0.5'));
    assert.equal(rejected.status, 400); assert.equal(rejected.body.code, 'WHOLE_QUANTITY_REQUIRED');
    assert.equal(await remaining(l), 3); assert.equal((await sell(payload(p, '1'))).status, 201);
  });
  await t.test('Retrying the same checkout returns its saved invoice without deducting again', async () => {
    const p = await product(); const l = await lot(p, 10);
    const body = { ...payload(p, '2'), clientRequestId: randomUUID(), expectedTotal: '20' };
    const first = await sell(body); const replay = await sell(body);
    assert.equal(first.status, 201); assert.equal(replay.status, 201); assert.equal(first.body.id, replay.body.id);
    assert.equal(await remaining(l), 8);
    const changed = await sell({ ...body, items: [{ productId: p.id, quantity: '3' }] });
    assert.equal(changed.status, 409); assert.equal(changed.body.code, 'SALE_REQUEST_CONFLICT');
    const anotherActor = await sell(body, manager); assert.equal(anotherActor.status, 409);
    assert.equal(await remaining(l), 8);
  });
  await t.test('Concurrent copies of one checkout create one invoice even when enough stock exists for both', async () => {
    const p = await product(); const l = await lot(p, 10); const count = await f.prisma.sale.count();
    const body = { ...payload(p, '2'), clientRequestId: randomUUID(), expectedTotal: '20' };
    const results = await Promise.all([sell(body), sell(body)]);
    const completed = results.filter(result => result.status === 201);
    assert.ok(completed.length >= 1);
    assert.ok(results.every(result => result.status === 201 || result.status === 409));
    assert.equal(new Set(completed.map(result => result.body.id)).size, 1);
    const replay = await sell(body);
    assert.equal(replay.status, 201); assert.equal(replay.body.id, completed[0].body.id);
    assert.equal(await remaining(l), 8);
    assert.equal(await f.prisma.sale.count(), count + 1);
    assert.equal(await f.prisma.sale.count({ where: { clientRequestId: body.clientRequestId } }), 1);
    assert.equal(await f.prisma.saleItem.count({ where: { productId: p.id } }), 1);
  });
  await t.test('Changed prices require a new confirmation before stock is consumed', async () => {
    const p = await product(); const l = await lot(p, 3);
    const result = await sell({ ...payload(p), expectedTotal: '9' });
    assert.equal(result.status, 409); assert.equal(result.body.code, 'PRICE_CHANGED');
    assert.equal(await remaining(l), 3);
  });
});
