const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
test('Sales history scope and safe immutable snapshots', async (t) => {
  const f = await catalogFixture(t); const { ADMIN: admin, STORE_MANAGER: manager, STAFF: staff } = f.cookies;
  const product = await f.fixture('product', { sku: f.code(), name: 'Historical product', defaultCost: 99, createdAt: new Date() });
  const sale = await f.fixture('sale', { invoiceNumber: f.code(), locationId: f.storeA.id, soldAt: new Date(), subtotal: 30, discountAmount: 2, totalAmount: 28, status: 'COMPLETED', createdAt: new Date() });
  await f.fixture('saleItem', { saleId: sale.id, productId: product.id, quantity: 3, unitPrice: 10, lineTotal: 30, costOfGoodsSold: 15 });
  const other = await f.fixture('sale', { invoiceNumber: f.code(), locationId: f.storeB.id, soldAt: new Date(), subtotal: 5, totalAmount: 5, status: 'COMPLETED', createdAt: new Date() });
  await t.test('Admin sees both stores, manager/staff see only own invoices and cannot fetch foreign IDs', async () => {
    assert.equal((await (await f.request('/sales', admin)).json()).total, 2);
    for (const cookie of [manager, staff]) {
      const rows = await (await f.request('/sales', cookie)).json(); assert.equal(rows.total, 1); assert.equal(rows.items[0].id, sale.id);
      assert.equal((await f.request(`/sales?locationId=${f.storeB.id}`, cookie)).status, 403);
      assert.equal((await f.request(`/sales/${other.id}`, cookie)).status, 404);
    }
  });
  await t.test('Stored prices and COGS retained; staff receives no cost fields anywhere', async () => {
    for (const cookie of [admin, manager, staff]) {
      const data = await (await f.request(`/sales/${sale.id}`, cookie)).json(); assert.equal(data.items[0].unitPrice, '10'); assert.equal(data.totalAmount, '28');
      assert.equal('costOfGoodsSold' in data.items[0], cookie !== staff);
      assert.equal(JSON.stringify(data).includes('defaultCost'), false);
    }
    const filtered = await (await f.request(`/sales?search=${sale.invoiceNumber}&pageSize=1`, admin)).json(); assert.equal(filtered.total, 1);
  });
  await t.test('No sale update, delete, cancellation or restoration endpoints', async () => {
    for (const [path, method] of [[`/sales/${sale.id}`, 'PATCH'], [`/sales/${sale.id}`, 'DELETE'], [`/sales/${sale.id}/void`, 'POST'], [`/sales/${sale.id}/cancel`, 'POST']]) assert.equal((await f.request(path, admin, method, {})).status, 404);
  });
});
