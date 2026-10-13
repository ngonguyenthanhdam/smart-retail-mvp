const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
test('Historical sales preserve stock and source COGS with whole-document rejection', async (t) => {
  const f = await catalogFixture(t);
  const unit = await f.fixture('unit', { code: f.code(), name: 'Piece' });
  const product = await f.fixture('product', { sku: f.code(), name: 'Rice', baseUnitId: unit.id, purchaseUnitId: unit.id, defaultCost: 999, createdAt: new Date() });
  const lot = await f.fixture('inventoryLot', { locationId: f.storeA.id, productId: product.id, lotNumber: f.code(), quantityOnHand: 20, unitCost: 500, receivedDate: new Date('2025-01-01'), createdAt: new Date() });
  const validRef = f.code(), invalidRef = f.code();
  const header = 'sale_reference,store_code,sale_date,product_sku,quantity,unit_price,discount_amount,cost_of_goods_sold';
  const line = (ref, qty, discount, cogs, store = f.storeA.code) => `${ref},${store},2025-01-02,${product.sku},${qty},10,${discount},${cogs}`;
  const bytes = [header, line(validRef,2,3,7), line(validRef,1,3,4), line(invalidRef,1,0,2), line(invalidRef,1,0,'')].join('\n');
  const preview = await f.upload('SALE', bytes); assert.equal(preview.status, 201); assert.equal(preview.body.validRows, 2); assert.equal(preview.body.invalidRows, 2);
  assert.equal(await f.prisma.sale.count({ where: { invoiceNumber: validRef } }), 0);
  const response = await f.request(`/imports/${preview.body.id}/confirm`, f.cookies.ADMIN, 'POST', { previewToken: preview.body.previewToken }); assert.equal(response.status, 201);
  const sale = await f.prisma.sale.findUniqueOrThrow({ where: { invoiceNumber: validRef }, include: { items: true } });
  assert.equal(sale.importJobId, preview.body.id); assert.equal(sale.subtotal.toString(), '30'); assert.equal(sale.discountAmount.toString(), '3'); assert.equal(sale.totalAmount.toString(), '27');
  assert.equal(sale.items.reduce((sum,i) => sum + Number(i.costOfGoodsSold),0), 11); assert.ok(sale.items.every((i) => i.discountAmount.isZero()));
  assert.equal(await f.prisma.sale.count({ where: { invoiceNumber: invalidRef } }), 0);
  assert.equal((await f.prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } })).quantityOnHand.toString(), '20');
  for (const rows of [[line(f.code(),1,11,2)], [line('mismatch',1,0,2),line('mismatch',1,0,2,f.storeB.code)], [line(validRef,1,0,2)]]) {
    const bad = await f.upload('SALE', [header,...rows].join('\n')); assert.equal(bad.body.validRows, 0);
  }
  assert.equal((await f.request(`/sales/${sale.id}`, f.cookies.STORE_MANAGER)).status, 200);
  const staffDetail = await (await f.request(`/sales/${sale.id}`, f.cookies.STAFF)).json(); assert.ok(staffDetail.items.every((i) => !('costOfGoodsSold' in i)));
});
