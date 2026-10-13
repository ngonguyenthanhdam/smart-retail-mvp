const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
const { businessDate, addDays } = require('../dist/src/inventory/expiry.js');
test('Operational dashboard uses exact historical snapshots and enforces report scope', async (t) => {
  const f = await catalogFixture(t); const { ADMIN: admin, STORE_MANAGER: manager, STAFF: staff } = f.cookies;
  const unit = await f.fixture('unit', { code: f.code(), name: 'Piece' });
  const product = await f.fixture('product', { sku: f.code(), name: 'Rice', defaultCost: 999, baseUnitId: unit.id, createdAt: new Date() });
  const empty = await f.fixture('product', { sku: f.code(), name: 'Empty', createdAt: new Date() });
  for (const p of [product, empty]) await f.fixture('storeProduct', { locationId: f.storeA.id, productId: p.id, sellingPrice: 10, minStockLevel: 2 });
  const saleHeader = 'sale_reference,store_code,sale_date,product_sku,quantity,unit_price,discount_amount,cost_of_goods_sold';
  const ref = f.code(); const bytes = [saleHeader,
    `${ref},${f.storeA.code},2025-04-10T17:00:00Z,${product.sku},2,10,3,7`,
    `${ref},${f.storeA.code},2025-04-10T17:00:00Z,${product.sku},1,10,3,4`,
    `${f.code()},${f.storeB.code},2025-04-11T16:59:59Z,${product.sku},4,20,0,30`].join('\n');
  for (const [type, data] of [['SALE',bytes], ['EXPENSE',['expense_type,amount,expense_date,location_code',`OTHER,2,2025-04-11,${f.storeA.code}`,`RENT,3,2025-04-11,${f.storeB.code}`,'SALARY,5,2025-04-11,'].join('\n')]]) {
    const preview = await f.upload(type, data); assert.equal(preview.body.invalidRows, 0);
    assert.equal((await f.request(`/imports/${preview.body.id}/confirm`, admin, 'POST', { previewToken: preview.body.previewToken })).status, 201);
  }
  const insertSale = async (status, date, total = 100) => f.fixture('sale', { invoiceNumber: f.code(), locationId: f.storeA.id, soldAt: new Date(date), subtotal: total, totalAmount: total, discountAmount: 0, status, createdAt: new Date(),
    items: { create: { productId: product.id, quantity: 1, unitPrice: total, lineTotal: total, costOfGoodsSold: 10 } } });
  await insertSale('VOIDED','2025-04-11T01:00:00Z',1000);
  await insertSale('COMPLETED','2025-04-10T16:59:59Z'); await insertSale('COMPLETED','2025-04-11T17:00:00Z');
  const today = businessDate();
  for (const [qty, expiry] of [[1,-1],[1,0],[0,-1]]) await f.fixture('inventoryLot', { locationId: f.storeA.id, productId: product.id, quantityOnHand: qty, unitCost: 4, receivedDate: new Date(addDays(today,-10)), expiryDate: new Date(addDays(today,expiry)), createdAt: new Date() });
  const path = '/reports/dashboard?from=2025-04-11&to=2025-04-11';
  const get = async (cookie = admin, suffix = '', target = path) => { const r = await f.request(target + suffix, cookie); assert.equal(r.status, 200); return r.json(); };
  await t.test('Revenue excludes voids and outside Vietnam-day boundaries; COGS uses source snapshots', async () => {
    const d = await get(); assert.equal(Number(d.metrics.revenue),107); assert.equal(Number(d.metrics.cogs),41); assert.equal(Number(d.metrics.expenses),10);
    assert.equal(Number(d.metrics.grossProfit),66); assert.equal(Number(d.metrics.estimatedOperatingProfit),56); assert.equal(d.metrics.invoices,2);
    assert.equal(Number(d.trend[0].revenue),107); assert.equal(Number(d.topProducts[0].quantity),7);
    await f.prisma.product.update({ where: { id: product.id }, data: { defaultCost: 3000 } }); assert.equal(Number((await get()).metrics.cogs),41);
  });
  await t.test('Manager sees own store only; STAFF and forged foreign scopes are denied', async () => {
    const d = await get(manager); assert.equal(d.locationId,f.storeA.id); assert.equal(Number(d.metrics.revenue),27); assert.equal(Number(d.metrics.expenses),2);
    assert.equal(Number(d.metrics.estimatedOperatingProfit),14); assert.equal('storeComparison' in d,false);
    assert.equal((await f.request(path + `&locationId=${f.storeB.id}`,manager)).status,403);
    assert.equal((await f.request(path,staff)).status,403); assert.equal((await f.request(path)).status,401);
  });
  await t.test('ADMIN comparison shows both stores without allocating company expenses', async () => {
    const d = await get(); const a = d.storeComparison.find((s) => s.id === f.storeA.id); const b = d.storeComparison.find((s) => s.id === f.storeB.id);
    assert.equal(Number(a.revenue),27); assert.equal(Number(a.grossProfit),16); assert.equal(Number(b.revenue),80); assert.equal(Number(b.grossProfit),50);
    assert.equal(Number((await get(admin, `&locationId=${f.storeB.id}`)).metrics.revenue),80);
  });
  await t.test('Current inventory includes expired physical quantity and configured zero stock', async () => {
    const d = await get(manager); assert.equal(Number(d.inventory.quantity),2); assert.equal(Number(d.inventory.value),8); assert.equal(d.inventory.lowStockPairs,2);
    assert.equal(d.inventory.expiredLots,1); assert.equal(d.inventory.expiringLots,1); assert.equal(d.inventory.activeProducts,2); assert.equal(d.inventory.asOf,today);
  });
  await t.test('Empty periods are zero-filled; invalid ranges and extra fields are rejected', async () => {
    const d = await get(manager,'','/reports/dashboard?from=2024-01-01&to=2024-01-03'); assert.equal(d.trend.length,3); assert.equal(Number(d.metrics.revenue),0); assert.equal(d.topProducts.length,0);
    for (const query of ['from=2025-04-12&to=2025-04-11','from=2025-02-30','from=2020-01-01&to=2025-01-01','role=ADMIN','locationId=bad']) assert.equal((await f.request('/reports/dashboard?' + query,manager)).status,400);
  });
  await t.test('Daily facts allocate fractional invoice discount cents exactly', async () => {
    const invoice = await f.fixture('sale', { invoiceNumber: f.code(), locationId: f.storeA.id, soldAt: new Date('2025-04-13T00:00:00Z'), subtotal: '0.03', discountAmount: '0.01', totalAmount: '0.02', status: 'COMPLETED', createdAt: new Date(),
      items: { create: [product,empty,product].map((p) => ({ productId: p.id, quantity: 1, unitPrice: '0.01', lineTotal: '0.01', costOfGoodsSold: 0 })) } });
    assert.ok(invoice.id);
    const [facts] = await f.prisma.$queryRaw`SELECT SUM(gross_revenue) AS gross, SUM(discount_amount) AS discount FROM v_sales_daily_facts WHERE location_id = ${f.storeA.id}::uuid AND business_date = '2025-04-13'::date`;
    assert.equal(facts.gross.toString(),'0.03'); assert.equal(facts.discount.toString(),'0.01');
  });
  await t.test('Estimated operating profit can be negative', async () => {
    await f.fixture('expense', { locationId: f.storeA.id, expenseType: 'OTHER', amount: 2, expenseDate: new Date('2024-01-01'), createdAt: new Date() });
    assert.equal((await get(manager,'','/reports/dashboard?from=2024-01-01&to=2024-01-01')).metrics.estimatedOperatingProfit,'-2.00');
  });
});
