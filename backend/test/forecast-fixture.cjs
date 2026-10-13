const assert = require('node:assert/strict');
const { seedForecastDemo } = require('../dist/prisma/forecast-demo.js');
const { demoForecastId: id, DEMO_JOB_ID } = require('../dist/src/forecasts/demo-source.js');

async function forecastSeedFixture(f) {
  assert.equal(await f.prisma.importJob.count({ where: { id: DEMO_JOB_ID } }), 0, 'Synthetic fixture must be unoccupied');
  const owned = { category: [1], unit: [10,11,12], location: [100,101,102], product: Array.from({ length: 12 }, (_, i) => 200+i),
    storeProduct: Array.from({ length: 36 }, (_, i) => 1000+i), importJob: [900] };
  for (const [model, numbers] of Object.entries(owned)) {
    assert.equal(await f.prisma[model].count({ where: { id: { in: numbers.map(id) } } }), 0);
  }
  const result = await seedForecastDemo(f.prisma, '2026-09-26');
  for (const [model, numbers] of Object.entries(owned)) f.ids[model].push(...numbers.map(id));
  const sales = await f.prisma.sale.findMany({ where: { importJobId: DEMO_JOB_ID }, select: { id: true } });
  f.ids.sale.push(...sales.map((s) => s.id));
  return result;
}
module.exports = { forecastSeedFixture };
