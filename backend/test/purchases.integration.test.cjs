const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');

test('Purchase drafts, permissions and calculated totals', async (t) => {
  const f = await catalogFixture(t); const { ADMIN: admin, STORE_MANAGER: manager, STAFF: staff } = f.cookies;
  const category = await f.fixture('category', { code: f.code(), name: 'Food', createdAt: new Date() });
  const unit = await f.fixture('unit', { code: f.code(), name: 'Piece' });
  const box = await f.fixture('unit', { code: f.code(), name: 'Box' });
  const product = await f.fixture('product', { sku: f.code(), name: 'Draft product', categoryId: category.id, baseUnitId: unit.id, purchaseUnitId: box.id, purchaseToBaseRatio: '12', createdAt: new Date() });
  const payload = (locationId = f.storeA.id) => ({ locationId, orderedAt: new Date().toISOString(), note: 'Delivery', items: [{ productId: product.id, purchaseQuantity: '2.5', unitCost: '24.25', lotNumber: 'B1' }] });
  let order;
  await t.test('Manager creates own-store draft with converted quantity and rounded totals, no stock changes', async () => {
    const result = await f.create('/purchases', 'purchaseOrder', manager, payload()); assert.equal(result.status, 201); order = result.body;
    assert.equal(order.status, 'DRAFT'); assert.equal(order.items[0].baseQuantity, '30'); assert.equal(order.items[0].lineTotal, '60.63'); assert.equal(order.totalCost, '60.63');
    assert.equal(await f.prisma.inventoryLot.count({ where: { productId: product.id } }), 0);
    assert.ok(order.orderNumber.startsWith('PO-')); assert.equal(order.creator.fullName, 'STORE_MANAGER');
  });
  await t.test('Scope is enforced for create, list, detail and edits; staff denied', async () => {
    assert.equal((await f.request('/purchases', staff)).status, 403);
    assert.equal((await f.request('/purchases', staff, 'POST', payload())).status, 403);
    assert.equal((await f.request('/purchases', manager, 'POST', payload(f.storeB.id))).status, 403);
    assert.equal((await f.request(`/purchases?locationId=${f.storeB.id}`, manager)).status, 403);
    const other = await f.create('/purchases', 'purchaseOrder', admin, payload(f.storeB.id)); assert.equal(other.status, 201);
    assert.equal((await f.request(`/purchases/${other.body.id}`, manager)).status, 404);
    assert.equal((await f.request(`/purchases/${other.body.id}`, manager, 'PATCH', payload())).status, 404);
    assert.equal((await f.request(`/purchases/${other.body.id}/cancel`, manager, 'POST', {})).status, 404);
    const list = await (await f.request('/purchases?status=DRAFT&pageSize=1', manager)).json(); assert.equal(list.total, 1); assert.equal(list.items[0].id, order.id);
  });
  await t.test('Reject untrusted totals, invalid quantities, overflow, dates and unsupported statuses', async () => {
    for (const data of [{ ...payload(), totalCost: 1 }, { ...payload(), items: [] }, { ...payload(), orderedAt: '2026-02-30T00:00:00Z' }, { ...payload(), status: 'RECEIVED' }]) {
      assert.equal((await f.request('/purchases', admin, 'POST', data)).status, 400);
    }
    for (const change of [{ purchaseQuantity: '0' }, { unitCost: '-1' }, { baseQuantity: '1' }, { purchaseQuantity: '9999999999' }, { expiryDate: '2026-02-30' }]) {
      const data = payload(); Object.assign(data.items[0], change); assert.equal((await f.request('/purchases', admin, 'POST', data)).status, 400);
    }
    assert.equal((await f.request('/purchases?status=INVALID', admin)).status, 400);
    assert.equal((await f.request('/purchases?from=2026-02-02&to=2026-01-01', admin)).status, 400);
  });
  await t.test('Edits replace draft lines, recalculate totals; historical units cannot change', async () => {
    const data = payload(); data.items[0].purchaseQuantity = '3';
    const response = await f.request(`/purchases/${order.id}`, manager, 'PATCH', data); assert.equal(response.status, 200);
    const updated = await response.json(); assert.equal(updated.totalCost, '72.75'); assert.equal(updated.items.length, 1); assert.equal(updated.items[0].baseQuantity, '36');
    assert.equal((await f.request(`/products/${product.id}`, admin, 'PATCH', { purchaseUnitId: unit.id })).status, 409);
    assert.equal((await f.request(`/products/${product.id}`, admin, 'PATCH', { baseUnitId: box.id })).status, 409);
  });
  await t.test('Cancelled drafts are immutable and create no stock', async () => {
    assert.equal((await f.request(`/purchases/${order.id}/cancel`, manager, 'POST', {})).status, 201);
    assert.equal((await f.request(`/purchases/${order.id}`, manager, 'PATCH', payload())).status, 409);
    assert.equal((await f.request(`/purchases/${order.id}/cancel`, manager, 'POST', {})).status, 409);
    assert.equal(await f.prisma.inventoryLot.count({ where: { productId: product.id } }), 0);
  });
});
