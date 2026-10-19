require('reflect-metadata');
const { randomUUID, randomBytes } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const bcrypt = require('bcrypt');

async function catalogFixture(t) {
  const { AppModule } = require('../dist/src/app.module.js');
  const { configureApp } = require('../dist/src/config/configure-app.js');
  const { PrismaService } = require('../dist/src/database/prisma.service.js');
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const prisma = app.get(PrismaService);
  const base = await app.getUrl();
  const prefix = `cat_${randomUUID().slice(0, 8)}`;
  let n = 0;
  const code = () => `${prefix}_${++n}`;
  const ids = { user: [], location: [], category: [], unit: [], product: [], storeProduct: [], inventoryLot: [], purchaseOrder: [], purchaseOrderItem: [], sale: [], saleItem: [], expense: [], importJob: [], forecastRun: [] };
  t.after(async () => {
    try {
      // Remove only AI Center metadata owned by this test fixture.
      await prisma.aiChatMessage.deleteMany({ where: { session: { ownerId: { in: ids.user } } } });
      await prisma.aiChatSession.deleteMany({ where: { ownerId: { in: ids.user } } });
      await prisma.aiAuditEvent.deleteMany({ where: { actorId: { in: ids.user } } });
      await prisma.aiDeployment.deleteMany({ where: { actorId: { in: ids.user } } });
      await prisma.aiTrainingJob.deleteMany({ where: { ownerId: { in: ids.user } } });
      await prisma.aiDatasetFile.deleteMany({ where: { dataset: { ownerId: { in: ids.user } } } });
      await prisma.aiDataset.deleteMany({ where: { ownerId: { in: ids.user } } });
      const runs = await prisma.forecastRun.findMany({ where: { requestedBy: { in: ids.user } }, select: { id: true } });
      const ownedRecommendations = await prisma.replenishmentRecommendation.findMany({ where: { OR: [{ locationId: { in: ids.location } }, { forecast: { forecastRunId: { in: runs.map(r => r.id) } } }] }, select: { id: true } });
      const ownedPurchases = await prisma.purchaseOrder.findMany({ where: { replenishmentRecommendationId: { in: ownedRecommendations.map(r => r.id) } }, select: { id: true } });
      ids.purchaseOrder.push(...ownedPurchases.map(p => p.id));
      await prisma.inventoryAlert.deleteMany({ where: { OR: [{ locationId: { in: ids.location } }, { forecast: { forecastRunId: { in: runs.map(r => r.id) } } }] } });
      await prisma.inventoryLot.deleteMany({ where: { purchaseOrderItem: { purchaseOrderId: { in: ownedPurchases.map(p => p.id) } } } });
      await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: ownedPurchases.map(p => p.id) } } });
      await prisma.purchaseOrder.deleteMany({ where: { id: { in: ownedPurchases.map(p => p.id) } } });
      await prisma.replenishmentRecommendation.deleteMany({ where: { id: { in: ownedRecommendations.map(r => r.id) } } });
      await prisma.demandForecast.deleteMany({ where: { forecastRunId: { in: runs.map((r) => r.id) } } });
      await prisma.forecastRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
      await prisma.salesHistoryCoverage.deleteMany({ where: { locationId: { in: ids.location } } });
      if (ids.importJob.length) {
        ids.product.push(...(await prisma.product.findMany({ where: { sku: { startsWith: prefix } }, select: { id: true } })).map((p) => p.id));
        ids.sale.push(...(await prisma.sale.findMany({ where: { importJobId: { in: ids.importJob } }, select: { id: true } })).map((p) => p.id));
        ids.purchaseOrder.push(...(await prisma.purchaseOrder.findMany({ where: { importJobId: { in: ids.importJob } }, select: { id: true } })).map((p) => p.id));
        ids.expense.push(...(await prisma.expense.findMany({ where: { createdBy: { in: ids.user } }, select: { id: true } })).map((p) => p.id));
        ids.inventoryLot.push(...(await prisma.inventoryLot.findMany({ where: { locationId: { in: ids.location }, productId: { in: ids.product } }, select: { id: true } })).map((p) => p.id));
      }
      // Transaction endpoints create their children/lots; remove only this fixture's documents.
      await prisma.inventoryLot.deleteMany({ where: { purchaseOrderItem: { purchaseOrderId: { in: ids.purchaseOrder } } } });
      await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: ids.purchaseOrder } } });
      await prisma.saleItem.deleteMany({ where: { saleId: { in: ids.sale } } });
      for (const model of ['inventoryLot', 'purchaseOrderItem', 'purchaseOrder', 'saleItem', 'sale', 'expense', 'importJob', 'storeProduct', 'product', 'unit', 'category', 'user', 'location']) {
        if (!ids[model].length) continue;
        if (model === 'category') await prisma.category.updateMany({ where: { id: { in: ids.category } }, data: { parentId: null } });
        await prisma[model].deleteMany({ where: { id: { in: ids[model] } } });
      }
    } finally { await app.close(); }
  });
  const request = (path, cookie, method = 'GET', body) => fetch(`${base}${path}`, { method,
    headers: { Origin: process.env.FRONTEND_ORIGIN, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  async function fixture(model, data) {
    const row = await prisma[model].create({ data }); ids[model].push(row.id); return row;
  }
  async function create(path, model, cookie, data) {
    const response = await request(path, cookie, 'POST', data);
    const body = await response.json();
    if (response.status === 201) ids[model].push(body.id);
    return { status: response.status, body };
  }
  const storeA = await fixture('location', { code: code(), name: 'Store A', locationType: 'STORE', createdAt: new Date() });
  const storeB = await fixture('location', { code: code(), name: 'Store B', locationType: 'STORE', createdAt: new Date() });
  const password = randomBytes(18).toString('hex');
  const passwordHash = await bcrypt.hash(password, 10);
  const cookies = {};
  for (const role of ['ADMIN', 'STORE_MANAGER', 'STAFF']) {
    const roleRow = await prisma.role.findUniqueOrThrow({ where: { code: role } });
    const name = code();
    await fixture('user', { username: name, email: `${name}@example.test`, fullName: role, roleId: roleRow.id, locationId: role === 'ADMIN' ? null : storeA.id, passwordHash, createdAt: new Date() });
    const response = await request('/auth/login', null, 'POST', { identifier: name, password });
    if (response.status !== 200) throw new Error('Fixture login failed.');
    cookies[role] = response.headers.get('set-cookie').split(';')[0];
  }
  const upload = async (type, data, name = 'data.csv', cookie = cookies.ADMIN) => {
    const form = new FormData(); form.set('importType', type); form.set('file', new Blob([data]), name);
    const response = await fetch(`${base}/imports/preview`, { method: 'POST', headers: { Origin: process.env.FRONTEND_ORIGIN, Cookie: cookie }, body: form });
    const body = await response.json();
    if (response.status === 201 && !ids.importJob.includes(body.id)) ids.importJob.push(body.id);
    return { status: response.status, body };
  };
  return { prisma, request, fixture, create, code, ids, cookies, storeA, storeB, upload, app };
}
module.exports = { catalogFixture };
