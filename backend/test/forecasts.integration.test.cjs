const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
const { forecastSeedFixture } = require('./forecast-fixture.cjs');
const { seedForecastDemo, buildForecastDemo } = require('../dist/prisma/forecast-demo.js');
const { ForecastHistory, seriesAt } = require('../dist/src/forecasts/forecast-history.js');
const { ForecastsService } = require('../dist/src/forecasts/forecasts.service.js');
const { demoForecastId: id, DEMO_JOB_ID, MODEL_VERSION } = require('../dist/src/forecasts/demo-source.js');
const { addDays } = require('../dist/src/inventory/expiry.js');

test('Monthly forecasting pipeline, confirmed sample history and role/store scope', async (t) => {
  let mode = 'normal'; let requestBody;
  const server = http.createServer(async (req, res) => {
    const model = { model_version: 'quantity-test-v2', algorithm: 'RollingMean28', usage_mode: 'STORE_HISTORY', model_target_space: 'base_unit_quantity', operational_units_supported: true, real_world_accuracy_verified: false };
    if (req.url === '/model-info') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(model)); return; }
    let text = ''; for await (const chunk of req) text += chunk;
    requestBody = JSON.parse(text);
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'unavailable') { res.writeHead(503); res.end(JSON.stringify({ code: 'MODEL_UNAVAILABLE' })); return; }
    const result = { ...model,
      origin: requestBody.origin, horizon_days: requestBody.horizon_days, negative_predictions_clipped: 0,
      predictions: requestBody.series.map((s) => ({ store_id: s.store_id, product_id: s.product_id,
        daily: Array.from({ length: requestBody.horizon_days }, (_, i) => ({ date: addDays(requestBody.origin,i+1), quantity: 1.23456 })) })) };
    if (mode === 'missing') result.predictions.pop();
    if (mode === 'duplicate') result.predictions[1] = result.predictions[0];
    if (mode === 'negative') result.predictions[0].daily[0].quantity = -1;
    if (mode === 'date') result.predictions[0].daily[0].date = requestBody.origin;
    if (mode === 'version') result.model_version = 'unapproved';
    if (mode === 'overflow') for (const p of result.predictions) for (const d of p.daily) d.quantity = 9999999999;
    res.end(JSON.stringify(result));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${server.address().port}`;
  const f = await catalogFixture(t); const manifest = await forecastSeedFixture(f);
  const { ADMIN: admin, STORE_MANAGER: manager, STAFF: staff } = f.cookies;
  await f.prisma.user.updateMany({ where: { id: { in: f.ids.user.slice(1) } }, data: { locationId: id(100) } });
  const history = f.app.get(ForecastHistory);
  const run = async (body = { horizonMonths: 1 }, cookie = admin) => {
    const response = await f.request('/forecasts/runs',cookie,'POST',body);
    return { status: response.status, body: await response.json() };
  };
  let globalRun;
  await t.test('Seed is reproducible, idempotent, labelled and never modifies inventory', async () => {
    assert.equal(manifest.stores,3); assert.equal(manifest.products,12); assert.equal(manifest.coveredCalendarDays,90);
    assert.equal(manifest.saleItems,2652); assert.equal(manifest.zeroSalesPairDays,363);
    assert.equal(buildForecastDemo('2026-09-26').hash, manifest.hash);
    await f.prisma.product.update({ where: { id: id(200) }, data: { name: 'Edited demo label' } });
    const repeat = await seedForecastDemo(f.prisma,'2026-09-26'); assert.equal(repeat.alreadyPresent,true);
    assert.equal(await f.prisma.sale.count({ where: { importJobId: DEMO_JOB_ID } }),264);
    assert.equal((await f.prisma.product.findUnique({ where: { id: id(200) } })).name,'Edited demo label');
    assert.equal(await f.prisma.inventoryLot.count({ where: { locationId: { in: [100,101,102].map(id) } } }),0);
    await assert.rejects(seedForecastDemo(f.prisma,'2026-09-25'), /different demo/);
  });
  await t.test('Daily demand sums completed base quantities, excludes voids and fills known zero days', async () => {
    const snapshot = await history.snapshot(); const selected = seriesAt(snapshot);
    assert.equal(selected.eligible.length,33); assert.equal(selected.skipped.length,3);
    assert.ok(selected.skipped.every((s) => s.reason === 'INSUFFICIENT_HISTORY'));
    assert.ok(selected.eligible.some((p) => p.history.some((d) => d.quantity === 0)));
    assert.ok(selected.eligible.every((p) => p.history.length === 30 && p.history[29].date === snapshot.origin));
    const raw = buildForecastDemo('2026-09-26');
    const complete = new Set(raw.sales.filter((s) => s.status === 'COMPLETED').map((s) => s.id));
    const actual = raw.items.filter((i) => complete.has(i.saleId)).reduce((n, i) => n + Number(i.quantity),0);
    assert.ok(Math.abs(snapshot.daily.reduce((n, d) => n + Number(d.quantity),0) - actual) < 1e-8);
    assert.ok(snapshot.daily.every((d) => d.synthetic));
    const origin = addDays(snapshot.origin,-7); const before = seriesAt(snapshot,origin);
    const changed = { ...snapshot, daily: snapshot.daily.map((d) => d.date > origin ? { ...d, quantity: '999999' } : d) };
    assert.deepEqual(seriesAt(changed,origin),before);
  });
  await t.test('Vietnam midnight boundaries preserve fractional base quantities and exclude void/future rows', async () => {
    const before = await history.snapshot(id(100));
    const value = (s, date) => Number(s.daily.find((d) => d.productId === id(206) && d.date === date)?.quantity ?? 0);
    for (const [date, quantity, status] of [['2026-09-24T16:59:59Z',0.25,'COMPLETED'],['2026-09-24T17:00:00Z',0.75,'COMPLETED'],
      ['2026-09-24T17:00:00Z',999,'VOIDED'],['2026-09-26T17:00:00Z',999,'COMPLETED']]) {
      await f.fixture('sale', { invoiceNumber: f.code(), importJobId: DEMO_JOB_ID, locationId: id(100), soldAt: new Date(date),
        status, subtotal: 0, totalAmount: 0, createdAt: new Date(), items: { create: { productId: id(206), quantity, unitPrice: 0, lineTotal: 0, costOfGoodsSold: 0 } } });
    }
    const after = await history.snapshot(id(100));
    assert.ok(Math.abs(value(after,'2026-09-24') - value(before,'2026-09-24') - 0.25) < 1e-10);
    assert.ok(Math.abs(value(after,'2026-09-25') - value(before,'2026-09-25') - 0.75) < 1e-10);
    assert.ok(after.daily.every((d) => d.date <= '2026-09-26'));
  });
  await t.test('ADMIN global run sends only 30 past daily quantities and persists exact rounded revenue', async () => {
    const response = await run(); assert.equal(response.status,201); globalRun = response.body;
    assert.equal(globalRun.status,'COMPLETED'); assert.equal(globalRun.forecasts.length,33); assert.equal(globalRun.skipped.length,3);
    assert.equal(requestBody.usage_mode,'STORE_HISTORY'); assert.equal(requestBody.series.length,33);
    assert.equal(globalRun.periodKind,'CALENDAR_MONTH'); assert.equal(globalRun.dataSource,'SYNTHETIC');
    assert.equal(globalRun.modelVersion,'quantity-test-v2'); assert.equal(globalRun.algorithm,'RollingMean28');
    assert.equal(globalRun.dailySeries.length,33); assert.equal(globalRun.dailySeries[0].daily.length,35);
    for (const series of requestBody.series) {
      assert.deepEqual(Object.keys(series).sort(),['history','product_id','store_id']);
      assert.equal(series.history.length,30); assert.ok(series.history.every((p) => p.date <= requestBody.origin));
    }
    for (const prediction of globalRun.forecasts) {
      assert.equal(Number(prediction.predictedQuantity),38.2714);
      const { Prisma } = require('../dist/generated/prisma/client.js');
      assert.equal(new Prisma.Decimal(prediction.predictedRevenue).toFixed(2),new Prisma.Decimal('38.2714').mul(prediction.estimatedUnitPrice).toFixed(2));
      assert.equal(prediction.periodStart.slice(0,10),'2026-10-01'); assert.equal(prediction.periodEnd.slice(0,10),'2026-10-31');
    }
  });
  await t.test('Manager sees only own forecasts/skips, even inside a global run; foreign route/query denied', async () => {
    const response = await f.request(`/forecasts/runs/${globalRun.id}`,manager); assert.equal(response.status,200);
    const own = await response.json(); assert.equal(own.forecasts.length,11); assert.equal(own.skipped.length,1);
    assert.ok(own.forecasts.every((p) => p.locationId === id(100))); assert.equal('metrics' in own,false);
    assert.ok(!JSON.stringify(own).includes(id(101))); assert.ok(!JSON.stringify(own).includes(id(102)));
    for (const path of ['/forecasts/runs', `/forecasts/runs/${globalRun.id}`]) assert.equal((await f.request(`${path}?locationId=${id(101)}`,manager)).status,403);
    const foreign = await run({ horizonMonths: 1, locationId: id(101) });
    assert.equal((await f.request(`/forecasts/runs/${foreign.body.id}`,manager)).status,404);
    const list = await (await f.request('/forecasts/runs',manager)).json();
    assert.equal(list.items.find((r) => r.id === globalRun.id).forecastCount,11);
    assert.ok(!list.items.some((r) => r.id === foreign.body.id));
  });
  await t.test('STAFF, unauthenticated callers and forged manager POST bodies cannot run/read forecasts', async () => {
    for (const cookie of [staff,manager]) assert.equal((await run({ horizonMonths: 1, locationId: id(101) },cookie)).status,403);
    for (const path of ['/forecasts/runs', `/forecasts/runs/${globalRun.id}`]) {
      assert.equal((await f.request(path,staff)).status,403); assert.equal((await f.request(path)).status,401);
    }
    assert.equal((await run({ horizonMonths: 2 })).status,400);
    assert.equal((await run({ horizonMonths: 1, role: 'ADMIN' })).status,400);
  });
  await t.test('Three complete calendar months are separate results; empty scopes fail without invented forecasts', async () => {
    const quarter = await run({ horizonMonths: 3, locationId: id(100) });
    assert.equal(quarter.body.status,'COMPLETED'); assert.equal(quarter.body.forecasts.length,33);
    assert.equal(requestBody.horizon_days,96); assert.equal(quarter.body.realWorldAccuracyVerified,false);
    assert.deepEqual(quarter.body.forecasts.slice(0,3).map(f => f.periodEnd.slice(0,10)),['2026-10-31','2026-11-30','2026-12-31']);
    const empty = await run({ horizonMonths: 1, locationId: f.storeA.id });
    assert.equal(empty.body.status,'FAILED'); assert.equal(empty.body.errorCode,'INSUFFICIENT_HISTORY'); assert.equal(empty.body.forecasts.length,0);
  });
  await t.test('Unavailable/invalid/overflow ML responses create FAILED runs with zero rows', async () => {
    for (mode of ['unavailable','missing','duplicate','negative','date','version','overflow']) {
      const failed = await run({ horizonMonths: 1, locationId: id(100) });
      assert.equal(failed.body.status,'FAILED',mode); assert.equal(failed.body.forecasts.length,0,mode);
      assert.equal(failed.body.errorCode,mode === 'unavailable' ? 'MODEL_UNAVAILABLE' : 'PREDICTION_FAILED');
      assert.ok(failed.body.completedAt); assert.ok(!JSON.stringify(failed.body).includes('Traceback'));
      assert.equal(await f.prisma.demandForecast.count({ where: { forecastRunId: failed.body.id } }),0);
    }
    mode = 'normal';
  });
  await t.test('Persistence failure rolls back all forecast rows and final COMPLETED status', async () => {
    const transaction = f.prisma.$transaction.bind(f.prisma); let count = 0;
    f.prisma.$transaction = (callback, options) => transaction(async (tx) => {
      const value = await callback(tx);
      if (++count === 2) throw new Error('Injected failure after forecast inserts');
      return value;
    },options);
    try {
      const result = await run({ horizonMonths: 1, locationId: id(100) });
      assert.equal(result.body.status,'FAILED'); assert.equal(result.body.errorCode,'PREDICTION_FAILED'); assert.equal(result.body.forecasts.length,0);
      assert.equal(await f.prisma.demandForecast.count({ where: { forecastRunId: result.body.id } }),0);
    } finally { f.prisma.$transaction = transaction; }
  });
  await t.test('Inactive products/configurations are excluded', async () => {
    await f.prisma.product.update({ where: { id: id(200) }, data: { isActive: false } });
    await f.prisma.storeProduct.update({ where: { id: id(1001) }, data: { isActive: false } });
    try { assert.equal(seriesAt(await history.snapshot(id(100))).eligible.length,9); }
    finally {
      await f.prisma.product.update({ where: { id: id(200) }, data: { isActive: true } });
      await f.prisma.storeProduct.update({ where: { id: id(1001) }, data: { isActive: true } });
    }
  });
  await t.test('Additional completed transactions in confirmed history remain eligible and restart fails interrupted runs', async () => {
    await f.fixture('sale', { invoiceNumber: f.code(), locationId: id(100), soldAt: new Date('2026-09-25T17:00:00Z'), status: 'COMPLETED', subtotal: 1,
      discountAmount: 0, totalAmount: 1, createdAt: new Date(), items: { create: { productId: id(200), quantity: 1, unitPrice: 1, lineTotal: 1, costOfGoodsSold: 0 } } });
    const snapshot = await history.snapshot(id(100)); const chosen = seriesAt(snapshot);
    assert.equal(chosen.eligible.length,11); assert.ok(chosen.eligible.some(p => p.productId === id(200) && p.dataSource === 'SYNTHETIC'));
    const interrupted = await f.prisma.forecastRun.create({ data: { modelVersion: MODEL_VERSION, algorithm: 'LightGBM', horizonMonths: 1,
      status: 'RUNNING', requestedBy: f.ids.user[0], startedAt: new Date() } });
    await f.app.get(ForecastsService).onModuleInit();
    assert.equal((await f.prisma.forecastRun.findUnique({ where: { id: interrupted.id } })).status,'FAILED');
  });
});
