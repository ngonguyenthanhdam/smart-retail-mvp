const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
test('Import metadata preview, cancellation, retry and role protection', async (t) => {
  const f = await catalogFixture(t);
  const bytes = Buffer.from(`sku,name,category_code,base_unit_code,purchase_unit_code\n${f.code()},Invalid,missing,missing,missing`);
  const before = await f.prisma.product.count();
  const result = await f.upload('PRODUCT', bytes); assert.equal(result.status, 201); assert.equal(result.body.status, 'PENDING'); assert.equal(result.body.invalidRows, 1);
  assert.equal(await f.prisma.product.count(), before);
  const { id } = result.body;
  for (const cookie of [f.cookies.STAFF, f.cookies.STORE_MANAGER]) {
    for (const path of ['/imports', '/imports/templates', `/imports/${id}`]) assert.equal((await f.request(path, cookie)).status, 403);
    for (const action of ['confirm', 'cancel']) assert.equal((await f.request(`/imports/${id}/${action}`, cookie, 'POST', {})).status, 403);
    assert.equal((await f.upload('PRODUCT', bytes, 'a.csv', cookie)).status, 403);
  }
  assert.equal((await f.request(`/imports/${id}/confirm`, f.cookies.ADMIN, 'POST', { previewToken: result.body.previewToken })).status, 400);
  assert.equal((await f.request(`/imports/${id}/cancel`, f.cookies.ADMIN, 'POST', {})).status, 201);
  const retry = await f.upload('PRODUCT', bytes, 'renamed.csv'); assert.equal(retry.body.id, id);
  const row = await f.prisma.importJob.findUniqueOrThrow({ where: { id } }); assert.equal(row.fileHash.length, 64); assert.equal(row.successRows, 0);
});
