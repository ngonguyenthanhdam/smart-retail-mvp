const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
const { businessDate, addDays } = require('../dist/src/inventory/expiry.js');

test('Atomic purchase receiving and source linkage', async (t) => {
  const f = await catalogFixture(t); const { ADMIN: admin, STORE_MANAGER: manager, STAFF: staff } = f.cookies;
  const category = await f.fixture('category', { code: f.code(), name: 'Food', createdAt: new Date() });
  const unit = await f.fixture('unit', { code: f.code(), name: 'Piece' });
  const product = await f.fixture('product', { sku: f.code(), name: 'Received milk', categoryId: category.id, baseUnitId: unit.id, purchaseUnitId: unit.id, purchaseToBaseRatio: 12, trackExpiry: true, createdAt: new Date() });
  const today = businessDate();
  const payload = (expiryDate = addDays(today, 20), locationId = f.storeA.id) => ({ locationId, orderedAt: new Date().toISOString(), items: [{ productId: product.id, purchaseQuantity: '2', unitCost: '25', expiryDate }] });
  async function draft(data = payload(), cookie = manager) { const r = await f.create('/purchases', 'purchaseOrder', cookie, data); assert.equal(r.status, 201); return r.body; }
  const receive = (id, cookie = manager) => f.request(`/purchases/${id}/receive`, cookie, 'POST', {});
  let received;
  await t.test('Receipt converts purchase cost to base cost, rounds, generates lot and updates inventory view', async () => {
    const order = await draft(); received = order;
    await f.prisma.product.update({ where: { id: product.id }, data: { purchaseToBaseRatio: 6 } });
    const r = await receive(order.id); assert.equal(r.status, 201); const body = await r.json(); assert.equal(body.status, 'RECEIVED'); assert.ok(body.receivedAt);
    const lots = await f.prisma.inventoryLot.findMany({ where: { purchaseOrderItemId: order.items[0].id } }); assert.equal(lots.length, 1);
    assert.equal(lots[0].quantityOnHand.toString(), '24'); assert.equal(lots[0].unitCost.toString(), '2.08'); assert.equal(lots[0].expiryDate.toISOString().slice(0, 10), addDays(today, 20));
    assert.equal(lots[0].lotNumber, body.items[0].lotNumber); assert.ok(lots[0].lotNumber.startsWith('LOT-'));
    const rows = await (await f.request(`/inventory?locationId=${f.storeA.id}`, manager)).json(); assert.equal(Number(rows.items.find((r) => r.productId === product.id).currentQuantity), 24);
  });
  await t.test('Received orders cannot be received twice, edited or cancelled', async () => {
    const r = await receive(received.id); assert.equal(r.status, 409); assert.equal((await r.json()).code, 'PURCHASE_ALREADY_RECEIVED');
    assert.equal((await f.request(`/purchases/${received.id}`, manager, 'PATCH', payload())).status, 409);
    assert.equal((await f.request(`/purchases/${received.id}/cancel`, manager, 'POST', {})).status, 409);
    await assert.rejects(f.prisma.purchaseOrderItem.delete({ where: { id: received.items[0].id } }));
  });
  await t.test('Missing/past expiry rolls back the status and all lot writes', async () => {
    for (const date of [null, addDays(today, -1)]) {
      const order = await draft(payload(date)); const r = await receive(order.id); assert.equal(r.status, 400); assert.equal((await r.json()).code, 'INVALID_EXPIRY_DATE');
      const row = await f.prisma.purchaseOrder.findUnique({ where: { id: order.id } }); assert.equal(row.status, 'DRAFT'); assert.equal(row.receivedAt, null);
      assert.equal(await f.prisma.inventoryLot.count({ where: { purchaseOrderItemId: order.items[0].id } }), 0);
    }
    // Stable item IDs force a valid lot write before the invalid second item is checked.
    const order = await draft(); const first = order.items[0];
    await f.prisma.purchaseOrderItem.update({ where: { id: first.id }, data: { id: '00000000-0000-4000-8000-000000000001' } });
    await f.prisma.purchaseOrderItem.create({ data: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', purchaseOrderId: order.id, productId: product.id, purchaseQuantity: 1, baseQuantity: 6, unitCost: 25, lineTotal: 25 } });
    assert.equal((await receive(order.id)).status, 400);
    assert.equal(await f.prisma.inventoryLot.count({ where: { purchaseOrderItem: { purchaseOrderId: order.id } } }), 0);
    assert.equal((await f.prisma.purchaseOrder.findUnique({ where: { id: order.id } })).status, 'DRAFT');
  });
  await t.test('Concurrent receipts accept exactly one and never duplicate lots', async () => {
    const order = await draft(); const results = await Promise.all([receive(order.id), receive(order.id)]); assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await f.prisma.inventoryLot.count({ where: { purchaseOrderItemId: order.items[0].id } }), 1);
  });
  await t.test('Staff, foreign-store manager, inactive product and cancelled order cannot receive', async () => {
    const other = await draft(payload(addDays(today, 20), f.storeB.id), admin);
    assert.equal((await receive(other.id)).status, 404); assert.equal((await receive(other.id, staff)).status, 403);
    const cancelled = await draft(); await f.request(`/purchases/${cancelled.id}/cancel`, manager, 'POST', {}); assert.equal((await receive(cancelled.id)).status, 409);
    await f.prisma.product.update({ where: { id: product.id }, data: { isActive: false } }); assert.equal((await receive(other.id, admin)).status, 400);
  });
});
