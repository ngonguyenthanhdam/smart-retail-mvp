const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
test('Historical purchases require source conversion, reject whole orders and never receive stock', async (t) => {
  const f = await catalogFixture(t); const product = await f.fixture('product', { sku: f.code(), name: 'Rice', purchaseToBaseRatio: 99, createdAt: new Date() });
  const refs = [f.code(),f.code(),f.code(),f.code()];
  const header = 'purchase_reference,location_code,ordered_at,received_at,status,product_sku,purchase_quantity,base_quantity,unit_cost';
  const line = (ref, status = 'RECEIVED', base = '24') => `${ref},${f.storeA.code},2025-01-01,${status === 'RECEIVED' ? '2025-01-02' : ''},${status},${product.sku},2,${base},12.50`;
  const bytes = [header,line(refs[0]),line(refs[1],'CANCELLED',''),line(refs[2]),line(refs[2],'RECEIVED',''),line(refs[3],'DRAFT')].join('\n');
  const preview = await f.upload('PURCHASE', bytes); assert.equal(preview.body.validRows, 2); assert.equal(preview.body.invalidRows, 3);
  assert.equal((await f.request(`/imports/${preview.body.id}/confirm`, f.cookies.ADMIN, 'POST', { previewToken: preview.body.previewToken })).status, 201);
  const order = await f.prisma.purchaseOrder.findUniqueOrThrow({ where: { orderNumber: refs[0] }, include: { items: true } });
  assert.equal(order.items[0].baseQuantity.toString(), '24'); assert.equal(order.totalCost.toString(), '25'); assert.equal(order.importJobId, preview.body.id);
  assert.equal(await f.prisma.inventoryLot.count({ where: { productId: product.id } }), 0);
  assert.equal(await f.prisma.purchaseOrder.count({ where: { orderNumber: { in: refs.slice(2) } } }), 0);
  // Source protection remains effective even if status was changed outside the public API.
  await f.prisma.purchaseOrder.update({ where: { id: order.id }, data: { status: 'DRAFT' } });
  for (const action of ['receive','cancel']) assert.equal((await f.request(`/purchases/${order.id}/${action}`, f.cookies.ADMIN, 'POST', {})).status, 409);
  assert.equal((await f.request(`/purchases/${order.id}`, f.cookies.ADMIN, 'PATCH', {})).status, 409);
  assert.equal(await f.prisma.inventoryLot.count({ where: { productId: product.id } }), 0);
});
