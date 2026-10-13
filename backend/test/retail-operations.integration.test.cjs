const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
const { businessDate, addDays } = require('../dist/src/inventory/expiry.js');

test('Purchase to receipt to sale to expense uses the same inventory and respects reassignment', async (t) => {
  const f = await catalogFixture(t); const { STORE_MANAGER: manager, STAFF: staff } = f.cookies;
  const category = await f.fixture('category', { code: f.code(), name: 'Retail loop', createdAt: new Date() });
  const unit = await f.fixture('unit', { code: f.code(), name: 'Piece' });
  const products = [];
  for (const [name, ratio, expiry, price] of [['Milk', 12, true, '10.50'], ['Rice', 1, false, '5']]) {
    const p = await f.fixture('product', { sku: f.code(), name, categoryId: category.id, baseUnitId: unit.id, purchaseUnitId: unit.id, purchaseToBaseRatio: ratio, trackExpiry: expiry, createdAt: new Date() });
    await f.fixture('storeProduct', { locationId: f.storeA.id, productId: p.id, sellingPrice: price }); products.push(p);
  }
  const [milk, rice] = products;
  const purchase = await f.create('/purchases', 'purchaseOrder', manager, { orderedAt: new Date().toISOString(), items: [
    { productId: milk.id, purchaseQuantity: '2', unitCost: '25', lotNumber: 'LOOP-MILK', expiryDate: addDays(businessDate(), 5) },
    { productId: rice.id, purchaseQuantity: '3', unitCost: '4' },
  ] });
  assert.equal(purchase.status, 201); assert.equal(purchase.body.totalCost, '62');
  const response = await f.request(`/purchases/${purchase.body.id}/receive`, manager, 'POST', {}); assert.equal(response.status, 201);
  const received = await response.json(); assert.equal(received.status, 'RECEIVED');
  const lots = await f.prisma.inventoryLot.findMany({ where: { purchaseOrderItem: { purchaseOrderId: received.id } } });
  assert.equal(lots.length, 2); assert.equal(lots.find(l => l.productId === milk.id).quantityOnHand.toString(), '24');
  assert.ok(lots.every(l => received.items.some(i => i.id === l.purchaseOrderItemId)));

  const sale = await f.create('/sales', 'sale', staff, { discountAmount: '0', items: [{ productId: milk.id, quantity: '3' }, { productId: rice.id, quantity: '2' }] });
  assert.equal(sale.status, 201); assert.equal(sale.body.subtotal, '41.5'); assert.equal(sale.body.totalAmount, '41.5');
  assert.ok(sale.body.items.every(i => !('costOfGoodsSold' in i)));
  const detail = await (await f.request(`/sales/${sale.body.id}`, manager)).json();
  assert.equal(detail.items.find(i => i.productId === milk.id).costOfGoodsSold, '6.24'); assert.equal(detail.items.find(i => i.productId === rice.id).costOfGoodsSold, '8');
  const stock = await (await f.request('/inventory', manager)).json();
  assert.equal(Number(stock.items.find(i => i.productId === milk.id).currentQuantity), 21); assert.equal(Number(stock.items.find(i => i.productId === rice.id).currentQuantity), 1);

  const expense = await f.create('/expenses', 'expense', manager, { expenseType: 'TRANSPORT', amount: '12.50', expenseDate: businessDate(), description: 'Purchase delivery' });
  assert.equal(expense.status, 201); assert.equal(expense.body.locationId, f.storeA.id);
  const creator = await f.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: received.id } });
  await f.prisma.user.update({ where: { id: creator.createdBy }, data: { locationId: f.storeB.id } });
  // The original cookie must immediately inherit the new assignment across all three modules.
  for (const route of [`/purchases/${received.id}`, `/sales/${sale.body.id}`, `/expenses/${expense.body.id}`]) assert.equal((await f.request(route, manager)).status, 404);
  for (const route of ['/purchases', '/sales', '/expenses']) assert.equal((await (await f.request(route, manager)).json()).total, 0);
});
