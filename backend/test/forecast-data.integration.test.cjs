const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parse } = require('csv-parse/sync');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
const { ForecastHistory, seriesAt } = require('../dist/src/forecasts/forecast-history.js');
const { businessDate, addDays } = require('../dist/src/inventory/expiry.js');

test('Real-store history requires explicit coverage, exports actual base quantities and enforces roles', async t => {
  const f = await catalogFixture(t); const {ADMIN:admin,STORE_MANAGER:manager,STAFF:staff}=f.cookies;
  const origin=addDays(businessDate(),-1), first=addDays(origin,-39);
  const unit=await f.fixture('unit',{code:f.code(),name:'Kilôgam',symbol:'kg',allowFraction:true});
  const product=await f.fixture('product',{sku:f.code(),name:'Hàng thật',baseUnitId:unit.id,purchaseUnitId:unit.id,createdAt:new Date()});
  await f.fixture('storeProduct',{locationId:f.storeA.id,productId:product.id,sellingPrice:20000});
  for(const [date,quantity,status] of [[first,2.5,'COMPLETED'],[origin,1.25,'COMPLETED'],[origin,99,'VOIDED']]) {
    await f.fixture('sale',{invoiceNumber:f.code(),locationId:f.storeA.id,soldAt:new Date(`${date}T05:00:00Z`),status,subtotal:0,totalAmount:0,createdAt:new Date(),items:{create:{productId:product.id,quantity,unitPrice:0,lineTotal:0,costOfGoodsSold:0}}});
  }
  const history=f.app.get(ForecastHistory);
  assert.equal(seriesAt(await history.snapshot(f.storeA.id)).eligible.length,0,'Sales at endpoints do not prove missing days are zeros');
  const cover={locationId:f.storeA.id,productIds:[product.id],periodStart:first,periodEnd:origin,note:'Đã đối chiếu toàn bộ lịch sử, ngày không có giao dịch là không bán được hàng.'};
  for(const cookie of [manager,staff]) assert.equal((await f.request('/forecasts/data/coverage',cookie,'POST',cover)).status,403);
  assert.equal((await f.request('/forecasts/data/coverage',admin,'POST',{...cover,periodEnd:businessDate()})).status,400);
  assert.equal((await f.request('/forecasts/data/coverage',admin,'POST',cover)).status,201);
  assert.equal((await f.request('/forecasts/data/coverage',admin,'POST',cover)).status,201);
  assert.equal(await f.prisma.salesHistoryCoverage.count({where:{locationId:f.storeA.id}}),1);
  const selected=seriesAt(await history.snapshot(f.storeA.id));
  assert.equal(selected.eligible.length,1); assert.equal(selected.eligible[0].dataSource,'STORE_HISTORY');
  assert.equal(selected.eligible[0].history.at(-1).quantity,1.25); assert.equal(selected.eligible[0].history[0].quantity,0);
  const csv=await f.request(`/forecasts/data/export?locationId=${f.storeA.id}`,admin);
  assert.equal(csv.status,200); assert.match(csv.headers.get('x-dataset-sha256'),/^[a-f0-9]{64}$/);
  const content=await csv.text(); assert.equal(content.trim().split('\r\n').length,41);
  const exported = parse(content, { columns: true });
  assert.equal(Number(exported.find(row => row.date === first).quantity), 2.5);
  assert.equal(Number(exported.find(row => row.date === origin).quantity), 1.25);
  assert.equal(exported.reduce((sum, row) => sum + Number(row.quantity), 0), 3.75, 'Voided sales never contribute to the training snapshot');
  assert.equal((await f.request('/forecasts/data/export',manager)).status,403);
  assert.equal((await f.request('/forecasts/data',staff)).status,403);
  assert.equal((await f.request(`/forecasts/data?locationId=${f.storeB.id}`,manager)).status,403);
  await f.prisma.salesHistoryCoverage.deleteMany({where:{locationId:f.storeA.id}});
  for(const [start,end] of [[first,addDays(origin,-15)],[addDays(origin,-13),origin]]) {
    assert.equal((await f.request('/forecasts/data/coverage',admin,'POST',{...cover,periodStart:start,periodEnd:end})).status,201);
  }
  const incomplete=seriesAt(await history.snapshot(f.storeA.id));
  assert.equal(incomplete.eligible.length,0); assert.equal(incomplete.skipped[0].reason,'INCOMPLETE_HISTORY');
  const withGap=await (await f.request(`/forecasts/data/export?locationId=${f.storeA.id}`,admin)).text();
  assert.ok(!withGap.includes(addDays(origin,-14)),'Export preserves unconfirmed holes for training validation');
});
