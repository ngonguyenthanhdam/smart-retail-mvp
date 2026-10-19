const { businessDate, addDays } = require('../dist/src/inventory/expiry.js');

// Isolated synthetic facts for both direct tools and the real local LLM.
async function businessFixture(f) {
  const today = businessDate(), unit = await f.fixture('unit', { code: f.code(), name: 'Piece' });
  const product = await f.fixture('product', { sku: f.code(), name: 'Synthetic test product', baseUnitId: unit.id, createdAt: new Date() });
  const stores = [f.storeA, f.storeB];
  for (const [i, store] of stores.entries()) {
    const amount = i === 0 ? 100 : 900;
    await f.fixture('sale', { invoiceNumber: f.code(), locationId: store.id, soldAt: new Date(`${today}T05:00:00Z`),
      subtotal: amount, totalAmount: amount, discountAmount: 0, status: 'COMPLETED', createdBy: f.ids.user[0], createdAt: new Date(),
      items: { create: { productId: product.id, quantity: 2, unitPrice: amount / 2, lineTotal: amount, costOfGoodsSold: 30 } } });
  }
  const run = await f.fixture('forecastRun', { modelVersion: 'synthetic-tool-test', algorithm: 'RollingMean28', horizonMonths: 1,
    status: 'COMPLETED', requestedBy: f.ids.user[0], startedAt: new Date(), completedAt: new Date(),
    dailyPredictions: stores.map((store, i) => ({ locationId: store.id, productId: product.id, dataSource: 'SYNTHETIC',
      daily: Array.from({ length: 30 }, (_, day) => ({ date: addDays(today, day), quantity: i === 0 ? 2 : 20 })) })) });
  for (const [i, store] of stores.entries()) await f.prisma.demandForecast.create({ data: { forecastRunId: run.id,
    locationId: store.id, productId: product.id, periodStart: new Date(today), periodEnd: new Date(addDays(today, 29)),
    predictedQuantity: i === 0 ? 60 : 600, estimatedUnitPrice: 50, predictedRevenue: i === 0 ? 3000 : 30000, createdAt: new Date() } });
  return { today, product, unit, run };
}
module.exports = { businessFixture };
