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

test('Recheck missing references, clear cancelled history, revive preview and preserve completed imports', async t => {
  const f = await catalogFixture(t), admin = f.cookies.ADMIN;
  const sku = f.code(), categoryCode = f.code(), unitCode = f.code();
  const data = Buffer.from(`sku,name,category_code,base_unit_code,purchase_unit_code\n${sku},Sample,${categoryCode},${unitCode},${unitCode}`);
  const first = await f.upload('AUTO', data); assert.equal(first.status, 201); assert.equal(first.body.importType, 'PRODUCT'); assert.equal(first.body.validRows, 0);
  const id = first.body.id;
  assert.equal((await f.request(`/imports/${id}`, admin, 'DELETE')).status, 409);
  for (const cookie of [f.cookies.STAFF, f.cookies.STORE_MANAGER]) {
    assert.equal((await f.request(`/imports/${id}`, cookie, 'DELETE')).status, 403);
    assert.equal((await f.request(`/imports/${id}/revalidate`, cookie, 'POST', {})).status, 403);
  }
  await f.request(`/imports/${id}/cancel`, admin, 'POST', {});
  assert.equal((await f.request(`/imports/${id}`, admin, 'DELETE')).status, 200);
  assert.equal((await f.prisma.importJob.findUniqueOrThrow({where:{id}})).dismissedAt instanceof Date, true);
  assert.equal((await (await f.request('/imports', admin)).json()).items.some(j => j.id === id), false);
  const retry = await f.upload('AUTO', data); assert.equal(retry.body.id, id);
  assert.equal((await f.prisma.importJob.findUniqueOrThrow({where:{id}})).dismissedAt, null);
  await f.fixture('category', { code: categoryCode, name: 'Example', createdAt: new Date() });
  await f.fixture('unit', { code: unitCode, name: 'Piece' });
  const checked = await f.request(`/imports/${id}/revalidate`, admin, 'POST', {}); assert.equal(checked.status, 201);
  const current = await checked.json(); assert.equal(current.validRows, 1); assert.equal(current.invalidRows, 0);
  assert.notEqual(current.previewToken, retry.body.previewToken);
  assert.equal(await f.prisma.product.count({where:{sku}}), 0);
  assert.equal((await f.request(`/imports/${id}/confirm`, admin, 'POST', {previewToken:retry.body.previewToken})).status, 409);
  assert.equal((await f.request(`/imports/${id}/confirm`, admin, 'POST', {previewToken:current.previewToken})).status, 201);
  assert.equal((await f.request(`/imports/${id}`, admin, 'DELETE')).status, 409);
  assert.equal((await f.request(`/imports/${id}/revalidate`, admin, 'POST', {})).status, 409);
  assert.equal(await f.prisma.product.count({where:{sku}}), 1);
});
