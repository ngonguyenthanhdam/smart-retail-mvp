const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
test('Units master data', async (t) => {
  const f = await catalogFixture(t); const admin = f.cookies.ADMIN;
  let unit;
  await t.test('Admin creates, edits and searches units; duplicate code rejected', async () => {
    const r = await f.create('/units', 'unit', admin, { code: f.code(), name: 'Can', symbol: 'can' });
    assert.equal(r.status, 201); unit = r.body;
    assert.equal((await f.create('/units', 'unit', admin, { code: unit.code, name: 'Duplicate' })).status, 409);
    assert.equal((await f.request(`/units/${unit.id}`, admin, 'PATCH', { name: 'Cans', symbol: null })).status, 200);
    const list = await (await f.request(`/units?search=${unit.code}&pageSize=1`, admin)).json();
    assert.equal(list.total, 1); assert.equal(list.items[0].name, 'Cans'); assert.equal(list.items[0].symbol, null);
  });
  await t.test('Only admin may manage units; status/conversion/delete are unavailable', async () => {
    assert.equal((await f.request('/units')).status, 401);
    for (const cookie of [f.cookies.STORE_MANAGER, f.cookies.STAFF]) {
      assert.equal((await f.request('/units', cookie, 'POST', { code: f.code(), name: 'Denied' })).status, 403);
      assert.equal((await f.request(`/units/${unit.id}`, cookie, 'PATCH', { name: 'Denied' })).status, 403);
    }
    assert.equal((await f.request(`/units/${unit.id}`, admin, 'PATCH', { isActive: false })).status, 400);
    assert.equal((await f.request(`/units/${unit.id}`, admin, 'DELETE')).status, 404);
    assert.equal((await f.create('/units', 'unit', admin, { code: ' ', name: 'Invalid' })).status, 400);
  });
});
