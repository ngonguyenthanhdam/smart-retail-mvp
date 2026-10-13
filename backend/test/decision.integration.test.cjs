const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
const { businessDate, addDays } = require('../dist/src/inventory/expiry.js');
const { Prisma } = require('../dist/generated/prisma/client.js');
const { recommendedQuantity } = require('../dist/src/replenishment/stock-snapshot.js');
const { PurchasesService } = require('../dist/src/purchases/purchases.service.js');

test('Decision support: snapshots, human decisions, purchase drafts and alerts', async t => {
  const f = await catalogFixture(t); const { ADMIN: admin, STORE_MANAGER: manager, STAFF: staff } = f.cookies;
  const today = businessDate();
  const request = async (path, body, cookie = admin, method = 'POST') => { const r = await f.request(path,cookie,method,body); return { status: r.status, body: await r.json() }; };
  const get = async (path, cookie = admin) => { const r = await request(path,undefined,cookie,'GET'); assert.equal(r.status,200); return r.body; };
  const unit = await f.fixture('unit',{ code: f.code(), name: 'CAN', allowFraction: false }); const box = await f.fixture('unit',{ code: f.code(), name: 'CARTON' });
  const products = [];
  for (let i=0;i<6;i++) {
    const p = await f.fixture('product',{ sku: f.code(), name: `Decision demo ${i}`, baseUnitId: unit.id, purchaseUnitId: box.id, purchaseToBaseRatio: 10, trackExpiry: i === 0, createdAt: new Date() });
    products.push(p);
    await f.fixture('storeProduct',{ locationId: f.storeA.id, productId: p.id, sellingPrice: 5, safetyStock: i === 0 ? 100 : 20 });
  }
  await f.fixture('storeProduct',{ locationId: f.storeB.id, productId: products[0].id, sellingPrice: 5, safetyStock: 100 });
  const lot = (index, quantity, expiry, locationId = f.storeA.id) => f.fixture('inventoryLot',{ locationId, productId: products[index].id,
    quantityOnHand: quantity, unitCost: 2, receivedDate: new Date(addDays(today,-10)), expiryDate: expiry === null ? null : new Date(addDays(today,expiry)), createdAt: new Date() });
  await lot(0,200,31); await lot(0,50,0); const expired = await lot(0,500,-1); await lot(0,0,-5); await lot(0,999,20,f.storeB.id);
  await lot(1,200,null); await lot(5,1,30); await lot(5,1,31);
  const draft = async (index,status = 'DRAFT') => {
    const p = await f.create('/purchases','purchaseOrder',admin,{ locationId: f.storeA.id, orderedAt: new Date().toISOString(), items: [{ productId: products[index].id, purchaseQuantity: 5, unitCost: 20 }] });
    assert.equal(p.status,201); if (status !== 'DRAFT') await f.prisma.purchaseOrder.update({ where: { id: p.body.id }, data: { status } }); return p.body;
  };
  await draft(0); await draft(0,'RECEIVED'); await draft(0,'CANCELLED'); await draft(1);
  await f.prisma.product.update({ where: { id: products[0].id }, data: { purchaseToBaseRatio: 24 } });
  const forecast = async (horizon, values, locationId = f.storeA.id) => {
    const dailyPredictions = values.map(([index,quantity]) => ({ locationId, productId: products[index].id, dataSource: 'SYNTHETIC', daily: Array.from({length:30*horizon},(_,i)=>({date:addDays(today,i),quantity:quantity/(30*horizon)})) }));
    const run = await f.fixture('forecastRun',{ modelVersion: 'quantity-test', algorithm: 'RollingMean28', horizonMonths: horizon, status: 'COMPLETED', requestedBy: f.ids.user[0], startedAt: new Date(), completedAt: new Date(), dailyPredictions, metrics: { usageMode: 'STORE_HISTORY', dataSource: 'SYNTHETIC', realWorldAccuracyVerified: false } });
    for (const [index,quantity] of values) await f.prisma.demandForecast.create({ data: { forecastRunId: run.id, locationId, productId: products[index].id, periodStart: new Date(today), periodEnd: new Date(addDays(today,30*horizon-1)), predictedQuantity: quantity, estimatedUnitPrice: 5, predictedRevenue: quantity*5, createdAt: new Date() } });
    return run;
  };
  const run = await forecast(1,[[0,500],[1,100],[2,10],[3,10],[4,500.25],[5,10]]);
  const planning = await forecast(3,[[0,1500],[1,100]]);
  const foreignRun = await forecast(1,[[0,500]],f.storeB.id);
  let recs;
  await t.test('Exact base-unit examples including negative floor', async () => {
    const d = x => new Prisma.Decimal(x);
    assert.equal(recommendedQuantity(d(500),d(100),d(250),d(50)).toFixed(),'300');
    assert.equal(recommendedQuantity(d(100),d(20),d(200),d(50)).toFixed(),'0');
  });
  await t.test('Generate from saved 30-day run; inventory and existing conversion snapshots are exact', async () => {
    const before = await f.prisma.purchaseOrder.count();
    const result = await request('/replenishment/generate',{ forecastRunId: run.id },manager);
    assert.equal(result.status,201); assert.equal(result.body.created,6);
    recs = (await get('/replenishment',manager)).items;
    const r = recs.find(r => r.productId === products[0].id);
    assert.equal(r.currentStockSnapshot,'250'); assert.equal(r.incomingStockSnapshot,'0'); assert.equal(r.safetyStockSnapshot,'100'); assert.equal(r.recommendedQuantity,'350');
    assert.equal(r.expectedPurchaseQuantity,'15'); assert.equal(r.expectedBaseQuantity,'360');
    assert.equal(r.incomingPolicy,'DRAFT_EXCLUDED'); assert.equal(r.demandQuantitySnapshot,'500');
    assert.equal(recs.find(r => r.productId === products[1].id).recommendedQuantity,'0');
    assert.equal(recs.find(r => r.productId === products[4].id).recommendedQuantity,'521', 'Counted units round the fractional forecast plus safety stock up to a whole unit');
    assert.equal(await f.prisma.purchaseOrder.count(),before); // no automatic procurement
  });
  const rec = i => recs.find(r => r.productId === products[i].id);
  await t.test('Generation retries preserve snapshots; a longer run supplies only the next 30 days', async () => {
    const result = await request('/replenishment/generate',{ forecastRunId: run.id }); assert.equal(result.body.reused,6); assert.equal(result.body.created,0);
    const longer = await request('/replenishment/generate',{ forecastRunId: planning.id });
    assert.equal(longer.status,201); assert.equal(longer.body.created,2); assert.equal(longer.body.operationalDays,30);
  });
  await t.test('Backend denies staff, cross-store queries and forged generation scope', async () => {
    for (const path of ['/replenishment','/alerts']) assert.equal((await request(path,undefined,staff,'GET')).status,403);
    assert.equal((await request('/replenishment/generate',{ forecastRunId: foreignRun.id },manager)).status,404);
    assert.equal((await request('/replenishment/generate',{ forecastRunId: run.id, locationId: f.storeB.id },manager)).status,403);
    assert.equal((await request(`/alerts?locationId=${f.storeB.id}`,undefined,manager,'GET')).status,403);
    assert.equal((await request('/alerts/evaluate',{},staff)).status,403);
    assert.equal((await request('/alerts/evaluate',{ locationId: f.storeB.id },manager)).status,403);
  });
  await t.test('ACCEPT uses original recommendation; repeat is safe and different decision conflicts', async () => {
    assert.equal((await request(`/replenishment/${rec(0).id}/decision`,{ decision: 'ACCEPTED' },manager)).status,201);
    assert.equal((await request(`/replenishment/${rec(0).id}/decision`,{ decision: 'ACCEPTED' },manager)).status,201);
    assert.equal((await request(`/replenishment/${rec(0).id}/decision`,{ decision: 'REJECTED' },manager)).status,409);
  });
  await t.test('ADJUST requires nonnegative precise quantity and a nonblank reason', async () => {
    assert.equal((await request(`/replenishment/${rec(2).id}/decision`,{ decision: 'ADJUSTED', managerQuantity: 1.5, reason: 'Fractional cans are invalid.' },manager)).status,400);
    for (const body of [{ decision: 'ADJUSTED', managerQuantity: 25 },{ decision: 'ADJUSTED', managerQuantity: 25, reason: '  ' },{ decision: 'ADJUSTED', managerQuantity: -1, reason: 'x' },{ decision: 'ADJUSTED', managerQuantity: true, reason: 'x' },{ decision: 'ADJUSTED', managerQuantity: '1.00001', reason: 'x' }]) assert.equal((await request(`/replenishment/${rec(2).id}/decision`,body,manager)).status,400);
    const result = await request(`/replenishment/${rec(2).id}/decision`,{ decision: 'ADJUSTED', managerQuantity: 25, reason: 'Local promotion expected next week.' },manager);
    assert.equal(result.status,201); assert.equal(result.body.managerQuantity,'25');
  });
  await t.test('Zero adjustment remains valid but cannot create an empty purchase', async () => {
    assert.equal((await request(`/replenishment/${rec(1).id}/decision`,{ decision: 'ADJUSTED', managerQuantity: 0, reason: 'Enough stock.' })).status,201);
    assert.equal((await request(`/replenishment/${rec(1).id}/purchase`,{ unitCost: 20 })).status,400);
  });
  await t.test('REJECT and PENDING cannot create orders', async () => {
    assert.equal((await request(`/replenishment/${rec(3).id}/decision`,{ decision: 'REJECTED', reason: 'No order needed.' },manager)).status,201);
    for (const i of [3,4]) assert.equal((await request(`/replenishment/${rec(i).id}/purchase`,{ unitCost: 20 })).status,409);
  });
  let acceptedOrder;
  await t.test('Accepted purchase rounds operational demand to cartons, stays DRAFT and stock unchanged', async () => {
    const before = await f.prisma.inventoryLot.count();
    const result = await request(`/replenishment/${rec(0).id}/purchase`,{ unitCost: '240.50' },manager);
    assert.equal(result.status,201); acceptedOrder = result.body;
    assert.equal(result.body.status,'DRAFT'); assert.equal(result.body.items[0].purchaseQuantity,'15'); assert.equal(result.body.items[0].baseQuantity,'360');
    assert.equal(result.body.totalCost,'3607.5'); assert.equal(await f.prisma.inventoryLot.count(),before);
    assert.equal((await request(`/replenishment/${rec(0).id}/purchase`,{ unitCost: 1 },manager)).body.id,acceptedOrder.id);
    assert.equal((await get(`/replenishment/${rec(0).id}`,manager)).purchaseOrder.id,acceptedOrder.id);
  });
  await t.test('Adjusted purchase and concurrent repeated requests create only one linked order', async () => {
    const results = await Promise.all([request(`/replenishment/${rec(2).id}/purchase`,{ unitCost: 20 }),request(`/replenishment/${rec(2).id}/purchase`,{ unitCost: 20 })]);
    assert.ok(results.some(r => r.status === 201)); assert.ok(results.every(r => [201,409].includes(r.status)));
    const orders = await f.prisma.purchaseOrder.findMany({ where: { replenishmentRecommendationId: rec(2).id }, include: { items: true } });
    assert.equal(orders.length,1); assert.equal(orders[0].items[0].purchaseQuantity.toFixed(),'3'); assert.equal(orders[0].items[0].baseQuantity.toFixed(),'30');
  });
  await t.test('Failed purchase transaction leaves neither an order nor a link', async () => {
    await request(`/replenishment/${rec(4).id}/decision`,{ decision: 'ACCEPTED' });
    const service = f.app.get(PurchasesService); const original = service.createDraft;
    service.createDraft = async function(...args) { await original.apply(this,args); throw new Error('Injected transaction failure'); };
    try { assert.equal((await request(`/replenishment/${rec(4).id}/purchase`,{ unitCost: 20 })).status,500); } finally { service.createDraft = original; }
    assert.equal(await f.prisma.purchaseOrder.count({ where: { replenishmentRecommendationId: rec(4).id } }),0);
  });
  await t.test('Foreign store and STAFF cannot read, decide or purchase a recommendation', async () => {
    await request('/replenishment/generate',{ forecastRunId: foreignRun.id });
    const foreign = (await get(`/replenishment?locationId=${f.storeB.id}`)).items[0];
    for (const [suffix,body] of [['',undefined],['/decision',{ decision: 'ACCEPTED' }],['/purchase',{ unitCost: 20 }]]) {
      assert.equal((await request(`/replenishment/${foreign.id}${suffix}`,body,manager,suffix ? 'POST' : 'GET')).status,404);
      assert.equal((await request(`/replenishment/${rec(0).id}${suffix}`,body,staff,suffix ? 'POST' : 'GET')).status,403);
    }
    assert.ok((await get('/replenishment',manager)).items.every(r => r.locationId === f.storeA.id));
  });
  await t.test('Stockout, planning overstock and expiry boundaries; no duplicate active alerts', async () => {
    await request('/alerts/evaluate',{},manager); const before = await get('/alerts?pageSize=100',manager);
    assert.ok(before.items.some(a => a.alertType === 'STOCKOUT_RISK'));
    assert.ok(before.items.some(a => a.alertType === 'OVERSTOCK_RISK' && /kế hoạch 90 ngày/.test(a.message)));
    const expiry = before.items.find(a => a.productId === products[0].id && a.alertType === 'EXPIRY_RISK');
    assert.equal(expiry.severity,'HIGH'); assert.equal(expiry.inventoryLotId,expired.id);
    assert.match(before.items.find(a => a.productId === products[5].id && a.alertType === 'EXPIRY_RISK').message,/1 lô còn hàng/);
    await request('/alerts/evaluate',{},manager); const after = await get('/alerts?pageSize=100',manager);
    assert.equal(after.total,before.total); assert.ok(after.items.every(a => a.locationId === f.storeA.id));
    assert.equal(after.items.find(a => a.id === expiry.id).detectedAt,expiry.detectedAt);
  });
  await t.test('Resolving and reopening expiry reuses the same alert, including unconfigured stock', async () => {
    const original = (await get('/alerts?pageSize=100',manager)).items.find(a => a.productId === products[5].id && a.alertType === 'EXPIRY_RISK');
    await f.prisma.inventoryLot.updateMany({ where: { productId: products[5].id }, data: { quantityOnHand: 0 } });
    await request('/alerts/evaluate',{},manager); assert.equal((await f.prisma.inventoryAlert.findUnique({ where: { id: original.id } })).status,'RESOLVED');
    await f.prisma.storeProduct.updateMany({ where: { productId: products[5].id }, data: { isActive: false } });
    await lot(5,2,7); await request('/alerts/evaluate',{},manager);
    const reopened = await f.prisma.inventoryAlert.findUnique({ where: { id: original.id } }); assert.equal(reopened.status,'OPEN'); assert.equal(reopened.resolvedAt,null);
  });
  await t.test('Linked purchase cannot move stores/products; explicit existing receiving still increases stock once', async () => {
    const item = acceptedOrder.items[0];
    const payload = { locationId: f.storeB.id, orderedAt: new Date().toISOString(), items: [{ productId: item.productId, purchaseQuantity: 13, unitCost: '240.50', expiryDate: addDays(today,60) }] };
    assert.equal((await request(`/purchases/${acceptedOrder.id}`,payload,admin,'PATCH')).status,400);
    payload.locationId = f.storeA.id;
    assert.equal((await request(`/purchases/${acceptedOrder.id}`,payload,admin,'PATCH')).status,200);
    assert.equal((await request(`/purchases/${acceptedOrder.id}/receive`,{},manager)).status,201);
    const lots = await f.prisma.inventoryLot.findMany({ where: { purchaseOrderItem: { purchaseOrderId: acceptedOrder.id } } });
    assert.equal(lots.length,1); assert.equal(lots[0].quantityOnHand.toFixed(),'312'); assert.equal(lots[0].unitCost.toFixed(2),'10.02');
    assert.equal((await request(`/purchases/${acceptedOrder.id}/receive`,{},manager)).status,409);
    assert.equal((await request(`/replenishment/${rec(0).id}/purchase`,{ unitCost: 1 },manager)).body.id,acceptedOrder.id);
    assert.equal((await get(`/replenishment/${rec(0).id}`)).currentStockSnapshot,'250');
  });
  await t.test('Cancelled linked order remains linked and does not permit duplicate creation', async () => {
    const result = await request(`/replenishment/${rec(4).id}/purchase`,{ unitCost: 20 }); assert.equal(result.status,201);
    await request(`/purchases/${result.body.id}/cancel`,{});
    const retry = await request(`/replenishment/${rec(4).id}/purchase`,{ unitCost: 20 }); assert.equal(retry.body.id,result.body.id); assert.equal(retry.body.status,'CANCELLED');
  });
  await t.test('Database UNIQUE/FK reject duplicate or nonexistent recommendation references', async () => {
    const sample = await f.prisma.purchaseOrder.findFirst({ where: { replenishmentRecommendationId: null } });
    await assert.rejects(f.prisma.purchaseOrder.update({ where: { id: sample.id }, data: { replenishmentRecommendationId: rec(0).id } }));
    await assert.rejects(f.prisma.purchaseOrder.update({ where: { id: sample.id }, data: { replenishmentRecommendationId: '00000000-0000-4000-8000-000000000000' } }));
  });
  await t.test('Newest forecast wins, equality creates neither stock risk and snapshots stay unchanged', async () => {
    await forecast(1,[[1,180]]); await forecast(3,[[1,180]]);
    await request('/alerts/evaluate',{},manager);
    assert.equal(await f.prisma.inventoryAlert.count({ where: { locationId: f.storeA.id, productId: products[1].id, status: 'OPEN', alertType: { in: ['STOCKOUT_RISK','OVERSTOCK_RISK'] } } }),0);
    assert.equal((await get(`/replenishment/${rec(1).id}`)).recommendedQuantity,'0');
    assert.equal(await f.prisma.inventoryAlert.count({ where: { productId: products[2].id, alertType: 'OVERSTOCK_RISK' } }),0,'No 90-day forecast means no overstock estimate');
  });
  await t.test('Concurrent different decisions allow one final decision only', async () => {
    const responses = await Promise.all(['ACCEPTED','REJECTED'].map(decision => request(`/replenishment/${rec(5).id}/decision`,{ decision })));
    assert.deepEqual(responses.map(r => r.status).sort(),[201,409]);
  });
  await t.test('Expired forecast and inactive configurations do not generate new operational recommendations', async () => {
    const expiredRun = await forecast(1,[[0,100]]);
    await f.prisma.forecastRun.update({where:{id:expiredRun.id},data:{dailyPredictions:[]}});
    await f.prisma.demandForecast.updateMany({ where: { forecastRunId: expiredRun.id }, data: { periodStart: new Date(addDays(today,-30)), periodEnd: new Date(addDays(today,-1)) } });
    assert.equal((await request('/replenishment/generate',{ forecastRunId: expiredRun.id })).body.skipped,1);
    const inactiveRun = await forecast(1,[[5,100]]);
    assert.equal((await request('/replenishment/generate',{ forecastRunId: inactiveRun.id })).body.skipped,1);
  });
  await t.test('Generation and alert evaluation roll back together on an injected failure', async () => {
    const fresh = await forecast(1,[[0,123]]);
    const { AlertsService } = require('../dist/src/alerts/alerts.service.js'); const service = f.app.get(AlertsService); const original = service.evaluateTx;
    service.evaluateTx = async function(...args) { await original.apply(this,args); throw new Error('Injected alert storage failure'); };
    try { assert.equal((await request('/replenishment/generate',{ forecastRunId: fresh.id })).status,500); } finally { service.evaluateTx = original; }
    assert.equal(await f.prisma.replenishmentRecommendation.count({ where: { forecast: { forecastRunId: fresh.id } } }),0);
  });
  await t.test('A new product without forecasts still gets a configured minimum-stock warning', async () => {
    const product = await f.fixture('product',{ sku: f.code(), name: 'Mặt hàng mới', baseUnitId: unit.id, purchaseUnitId: unit.id, purchaseToBaseRatio: 1, createdAt: new Date() });
    await f.fixture('storeProduct',{ locationId: f.storeA.id, productId: product.id, sellingPrice: 10, minStockLevel: 5 });
    await request('/alerts/evaluate',{},manager);
    const alert = (await get('/alerts?pageSize=100',manager)).items.find(row => row.productId === product.id && row.alertType === 'STOCKOUT_RISK');
    assert.ok(alert);
    assert.equal(alert.demandForecastId,null);
    assert.match(alert.message,/cảnh báo theo mức tồn đã cấu hình/);
  });
  await t.test('Decision cards expose units, scoped totals, SKU search and severity ordering across pages', async () => {
    const all = await get('/alerts?status=all&pageSize=100',manager);
    const ordered = [...all.items].sort((a,b) => ['OPEN','RESOLVED'].indexOf(a.status) - ['OPEN','RESOLVED'].indexOf(b.status)
      || ['CRITICAL','HIGH','MEDIUM','LOW'].indexOf(a.severity) - ['CRITICAL','HIGH','MEDIUM','LOW'].indexOf(b.severity)
      || Date.parse(b.detectedAt) - Date.parse(a.detectedAt) || a.id.localeCompare(b.id));
    assert.deepEqual(all.items.map(a => a.id), ordered.map(a => a.id));
    const pages = [];
    for (let page=1; page <= Math.ceil(all.total/2); page++) {
      const result = await get(`/alerts?status=all&pageSize=2&page=${page}`,manager);
      pages.push(...result.items.map(a => a.id));
      assert.deepEqual(result.summary, all.summary);
      assert.ok(result.items.every(a => a.locationId === f.storeA.id && a.product.baseUnit.allowFraction === false));
    }
    assert.deepEqual(pages, all.items.map(a => a.id));
    assert.equal(all.summary.open, all.items.filter(a => a.status === 'OPEN').length);
    assert.equal(all.summary.urgent, all.items.filter(a => a.status === 'OPEN' && ['HIGH','CRITICAL'].includes(a.severity)).length);
    const filtered = await get(`/alerts?alertType=STOCKOUT_RISK&search=${products[0].sku}`,manager);
    assert.ok(filtered.total > 0);
    assert.ok(filtered.items.every(a => a.productId === products[0].id && a.alertType === 'STOCKOUT_RISK'));
    assert.equal(filtered.summary.expiry, 0);
    const recList = await get('/replenishment?pageSize=100',manager);
    const recPage = await get('/replenishment?pageSize=1',manager);
    assert.deepEqual(recList.summary, recPage.summary);
    assert.equal(recList.summary.pending, recList.items.filter(r => r.decisionStatus === 'PENDING').length);
    assert.equal(recList.summary.approved, recList.items.filter(r => ['ACCEPTED','ADJUSTED'].includes(r.decisionStatus) && !r.purchaseOrder).length);
    const skuResult = await get(`/replenishment?search=${products[0].sku}`,manager);
    assert.ok(skuResult.total > 0);
    assert.ok(skuResult.items.every(r => r.productId === products[0].id && r.locationId === f.storeA.id));
    assert.equal((await get('/replenishment?status=PENDING',manager)).summary.linked, 0);
  });
});
