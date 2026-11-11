const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
const { buildForecastDemo, seedForecastDemo, forecastDemoProducts, forecastDemoAssortments } = require('../dist/prisma/forecast-demo.js');
const { demoForecastId: id, DEMO_JOB_ID, DEMO_UPGRADE_JOB_ID, DEMO_SOURCE } = require('../dist/src/forecasts/demo-source.js');
const { ForecastHistory, seriesAt } = require('../dist/src/forecasts/forecast-history.js');

test('Legacy forecast demo upgrades without replacing any invoice, lot or store override', async (t) => {
  const f = await catalogFixture(t);
  const end = '2026-09-26';
  const legacy = buildForecastDemo(end, true);
  const createdAt = new Date(legacy.manifest.startDate);
  await f.fixture('category', { id: id(1), code: 'FC-GOODS', name: 'Demo', externalSource: DEMO_SOURCE, createdAt });
  const units = ['CAN', 'PCS', 'KG'];
  for (const [n, unit] of units.entries()) await f.fixture('unit', { id: id(10 + n), code: `FC-${unit}`, name: unit });
  for (let store = 0; store < 3; store++) await f.fixture('location', {
    id: id(100 + store), code: `FC-ST0${store + 1}`, name: `Demo ${store}`, locationType: 'STORE', externalSource: DEMO_SOURCE, createdAt,
  });
  for (let p = 0; p < 12; p++) {
    const [name, unit, price] = forecastDemoProducts[p];
    await f.fixture('product', { id: id(200 + p), sku: `FC-${String(p + 1).padStart(2, '0')}`, name, categoryId: id(1),
      baseUnitId: id(10 + units.indexOf(unit)), purchaseUnitId: id(10 + units.indexOf(unit)), defaultCost: price * 0.65,
      externalSource: DEMO_SOURCE, externalId: String(p + 1), createdAt });
    for (let store = 0; store < 3; store++) await f.fixture('storeProduct', {
      id: id(1000 + store * 12 + p), locationId: id(100 + store), productId: id(200 + p), sellingPrice: price + store * 500, safetyStock: 5, minStockLevel: 2,
    });
  }
  await f.fixture('importJob', { id: DEMO_JOB_ID, importType: 'SALE', fileName: `SYNTHETIC_forecast_v1_${end}.seed`, fileHash: legacy.hash,
    status: 'COMPLETED', totalRows: legacy.items.length, successRows: legacy.items.length, failedRows: 0, createdBy: f.ids.user[0], createdAt });
  await f.prisma.sale.createMany({ data: legacy.sales }); f.ids.sale.push(...legacy.sales.map((s) => s.id));
  await f.prisma.saleItem.createMany({ data: legacy.items });
  for (let store = 0; store < 3; store++) for (let p = 0; p < 12; p++) await f.prisma.salesHistoryCoverage.create({ data: {
    locationId: id(100 + store), productId: id(200 + p), periodStart: new Date(p === 11 ? '2026-09-13' : legacy.manifest.startDate),
    periodEnd: new Date(end), source: 'SYNTHETIC', note: 'Legacy coverage', confirmedBy: f.ids.user[0],
  } });
  await f.prisma.product.update({ where: { id: id(200) }, data: { name: 'Business edited name', defaultCost: 123 } });
  await f.prisma.storeProduct.update({ where: { id: id(1000) }, data: { sellingPrice: 99, safetyStock: 17, minStockLevel: 7 } });
  const lot = await f.fixture('inventoryLot', { locationId: id(102), productId: id(211), lotNumber: f.code(), quantityOnHand: 8,
    unitCost: 2, receivedDate: createdAt, createdAt });
  const beforeSales = await f.prisma.sale.findMany({ where: { importJobId: DEMO_JOB_ID }, include: { items: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } });
  await assert.rejects(seedForecastDemo(f.prisma, end), /legacy demo exists/);
  await assert.rejects(seedForecastDemo(f.prisma, end, { upgradeExisting: true }), (e) => e.getResponse?.().code === 'STOCK_REMAINS_CONFIRMATION_REQUIRED');
  assert.equal(await f.prisma.product.count({ where: { externalSource: DEMO_SOURCE } }), 12);
  assert.equal(await f.prisma.importJob.count({ where: { id: DEMO_UPGRADE_JOB_ID } }), 0);
  // Track every reserved addition before the upgrade so even a failing assertion cleans up.
  f.ids.product.push(...Array.from({ length: 8 }, (_, n) => id(212 + n)));
  f.ids.importJob.push(DEMO_UPGRADE_JOB_ID);
  const result = await seedForecastDemo(f.prisma, end, { upgradeExisting: true, confirmDiscontinue: true });
  assert.equal(result.upgraded, true);
  const newSales = await f.prisma.sale.findMany({ where: { importJobId: DEMO_UPGRADE_JOB_ID } }); f.ids.sale.push(...newSales.map((s) => s.id));
  assert.equal(await f.prisma.product.count({ where: { externalSource: DEMO_SOURCE } }), 20);
  assert.deepEqual(await f.prisma.sale.findMany({ where: { importJobId: DEMO_JOB_ID }, include: { items: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } }), beforeSales);
  assert.equal((await f.prisma.inventoryLot.findUnique({ where: { id: lot.id } })).quantityOnHand.toString(), '8');
  assert.equal((await f.prisma.product.findUnique({ where: { id: id(200) } })).name, 'Business edited name');
  const override = await f.prisma.storeProduct.findUnique({ where: { id: id(1000) } });
  assert.equal(override.sellingPrice.toString(), '99'); assert.equal(override.safetyStock.toString(), '17'); assert.equal(override.minStockLevel.toString(), '7');
  for (let store = 0; store < 3; store++) {
    const rows = await f.prisma.storeProduct.findMany({ where: { locationId: id(100 + store), isActive: true }, select: { productId: true } });
    assert.deepEqual(rows.map((r) => r.productId).sort(), forecastDemoAssortments[store].map((p) => id(200 + p)).sort());
  }
  const history = f.app.get(ForecastHistory);
  const snapshot = await history.snapshot();
  assert.ok(snapshot.daily.every((s) => s.synthetic));
  assert.equal(seriesAt(snapshot).eligible.length, 36); assert.equal(seriesAt(snapshot).skipped.length, 1);
  const count = await f.prisma.sale.count();
  assert.equal((await seedForecastDemo(f.prisma, end)).alreadyPresent, true);
  assert.equal(await f.prisma.sale.count(), count);
  assert.equal(await f.prisma.inventoryLot.count({ where: { id: lot.id } }), 1);
});
