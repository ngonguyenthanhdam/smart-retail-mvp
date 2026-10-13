const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Workbook } = require('exceljs');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
test('Product import confirmation, partial results, duplicate protection and rollback', async (t) => {
  const f = await catalogFixture(t); const admin = f.cookies.ADMIN;
  const category = await f.fixture('category', { code: f.code(), name: 'Food', createdAt: new Date() });
  const unit = await f.fixture('unit', { code: f.code(), name: 'Piece' });
  const header = ['sku','name','category_code','base_unit_code','purchase_unit_code','default_cost'];
  const row = (sku, cost = '5.50') => [sku,'Product',category.code,unit.code,unit.code,cost];
  const csv = (rows) => [header, ...rows].map((r) => r.join(',')).join('\n');
  const confirm = async (preview) => { const r = await f.request(`/imports/${preview.id}/confirm`, admin, 'POST', { previewToken: preview.previewToken }); return { status: r.status, body: await r.json() }; };
  await t.test('Preview creates no products; confirmation imports only valid rows and blocks renamed duplicates', async () => {
    const sku = f.code(); const bytes = csv([row(sku), row(f.code(), '-1')]);
    const preview = await f.upload('PRODUCT', bytes); assert.equal(preview.status, 201); assert.equal(preview.body.validRows, 1);
    assert.equal(await f.prisma.product.count({ where: { sku } }), 0);
    const result = await confirm(preview.body); assert.equal(result.status, 201); assert.equal(result.body.status, 'PARTIAL'); assert.equal(result.body.successRows, 1); assert.equal(result.body.failedRows, 1);
    assert.equal((await f.prisma.product.findUniqueOrThrow({ where: { sku } })).defaultCost.toString(), '5.5');
    assert.equal((await f.upload('PRODUCT', bytes, 'renamed.csv')).status, 409);
    assert.equal((await f.upload('PRODUCT', csv([row(sku)]))).body.validRows, 0);
  });
  await t.test('XLSX confirms and duplicate identifiers within a file are all rejected', async () => {
    const book = new Workbook(); const sheet = book.addWorksheet('Products'); sheet.addRow(header); sheet.addRow(row(f.code()));
    const preview = await f.upload('PRODUCT', Buffer.from(await book.xlsx.writeBuffer()), 'products.xlsx'); assert.equal(preview.status, 201); assert.equal((await confirm(preview.body)).body.status, 'COMPLETED');
    const sku = f.code(); assert.equal((await f.upload('PRODUCT', csv([row(sku),row(sku)]))).body.invalidRows, 2);
  });
  await t.test('Changed relation state requires another preview', async () => {
    const preview = await f.upload('PRODUCT', csv([row(f.code())]));
    await f.prisma.category.update({ where: { id: category.id }, data: { isActive: false } });
    assert.equal((await confirm(preview.body)).status, 409);
    await f.prisma.category.update({ where: { id: category.id }, data: { isActive: true } });
  });
  await t.test('Failure after an earlier write rolls back every product and records a failed job', async () => {
    const skus = [f.code(), f.code()]; const preview = await f.upload('PRODUCT', csv(skus.map((sku) => row(sku))));
    const { ImportPlanner } = require('../dist/src/imports/import-plan.js'); const planner = f.app.get(ImportPlanner); const original = planner.apply;
    let calls = 0; planner.apply = async function (...args) { if (++calls === 2) throw new Error('Injected transaction failure'); return original.apply(this, args); };
    try { assert.equal((await confirm(preview.body)).status, 500); } finally { planner.apply = original; }
    assert.equal(await f.prisma.product.count({ where: { sku: { in: skus } } }), 0);
    const job = await f.prisma.importJob.findUniqueOrThrow({ where: { id: preview.body.id } }); assert.equal(job.status, 'FAILED'); assert.equal(job.successRows, 0);
  });
  await t.test('Concurrent confirmations create exactly one product', async () => {
    const sku = f.code(); const preview = await f.upload('PRODUCT', csv([row(sku)]));
    const results = await Promise.all([confirm(preview.body), confirm(preview.body)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201,409]); assert.equal(await f.prisma.product.count({ where: { sku } }), 1);
  });
  await t.test('An older tab cannot confirm a replacement preview', async () => {
    const sku = f.code(); const data = csv([row(sku)]);
    const first = await f.upload('PRODUCT', data); const second = await f.upload('PRODUCT', data);
    assert.equal(first.body.id, second.body.id); assert.notEqual(first.body.previewToken, second.body.previewToken);
    assert.equal((await confirm(first.body)).status, 409); assert.equal(await f.prisma.product.count({ where: { sku } }), 0);
    assert.equal((await confirm(second.body)).status, 201);
  });
  await t.test('Expired previews cannot write; re-upload refreshes the pending job', async () => {
    const sku = f.code(); const data = csv([row(sku)]); const first = await f.upload('PRODUCT', data);
    const clock = Date.now; Date.now = () => clock() + 31 * 60 * 1000;
    try { assert.equal((await confirm(first.body)).status, 409); } finally { Date.now = clock; }
    assert.equal(await f.prisma.product.count({ where: { sku } }), 0);
    const next = await f.upload('PRODUCT', data); assert.equal(next.body.id, first.body.id); assert.equal((await confirm(next.body)).status, 201);
  });
});
