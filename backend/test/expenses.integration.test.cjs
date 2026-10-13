const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
test('Expense management and location isolation', async (t) => {
  const f = await catalogFixture(t); const { ADMIN: admin, STORE_MANAGER: manager, STAFF: staff } = f.cookies;
  const values = { expenseType: 'RENT', amount: '123.45', expenseDate: '2026-09-25', description: 'Monthly rent' };
  let own, company, other;
  await t.test('Manager records own expense; admin records company and any location expense', async () => {
    own = await f.create('/expenses', 'expense', manager, values); assert.equal(own.status, 201); assert.equal(own.body.locationId, f.storeA.id); assert.equal(own.body.amount, '123.45');
    company = await f.create('/expenses', 'expense', admin, { ...values, locationId: null }); assert.equal(company.status, 201); assert.equal(company.body.locationId, null);
    other = await f.create('/expenses', 'expense', admin, { ...values, locationId: f.storeB.id }); assert.equal(other.status, 201);
    const warehouse = await f.fixture('location', { code: f.code(), name: 'Warehouse', locationType: 'CENTRAL_WAREHOUSE', createdAt: new Date() });
    assert.equal((await f.create('/expenses', 'expense', admin, { ...values, locationId: warehouse.id })).status, 201);
  });
  await t.test('Manager lists only own data and cannot read/edit/create foreign or company expenses', async () => {
    const list = await (await f.request('/expenses', manager)).json(); assert.equal(list.total, 1); assert.equal(list.items[0].id, own.body.id);
    for (const target of [company, other]) {
      assert.equal((await f.request(`/expenses/${target.body.id}`, manager)).status, 404);
      assert.equal((await f.request(`/expenses/${target.body.id}`, manager, 'PATCH', { amount: '1' })).status, 404);
    }
    for (const locationId of [null, f.storeB.id]) {
      assert.equal((await f.request('/expenses', manager, 'POST', { ...values, locationId })).status, 403);
      assert.equal((await f.request(`/expenses/${own.body.id}`, manager, 'PATCH', { locationId })).status, 403);
    }
    assert.equal((await f.request(`/expenses?locationId=${f.storeB.id}`, manager)).status, 403);
  });
  await t.test('Staff denied; no delete endpoint; invalid amounts, dates, types and spoofed creator rejected', async () => {
    for (const [path, method, body] of [['/expenses', 'GET'], ['/expenses', 'POST', values], [`/expenses/${own.body.id}`, 'GET'], [`/expenses/${own.body.id}`, 'PATCH', { amount: '1' }]]) assert.equal((await f.request(path, staff, method, body)).status, 403);
    assert.equal((await f.request(`/expenses/${own.body.id}`, admin, 'DELETE')).status, 404);
    for (const change of [{ amount: '-1' }, { amount: '1.001' }, { expenseDate: '2026-02-30' }, { expenseType: 'INVALID' }, { createdBy: f.ids.user[0] }]) assert.equal((await f.request('/expenses', manager, 'POST', { ...values, ...change })).status, 400);
    assert.equal((await f.request('/expenses', manager, 'POST', { amount: '1' })).status, 400);
  });
  await t.test('Own edits preserve creator; filters and zero-valued expenses work', async () => {
    const response = await f.request(`/expenses/${own.body.id}`, manager, 'PATCH', { amount: '0', expenseType: 'OTHER', description: 'Corrected expense' }); assert.equal(response.status, 200);
    const row = await response.json(); assert.equal(row.amount, '0'); assert.equal(row.creator.id, own.body.creator.id);
    const list = await (await f.request('/expenses?expenseType=OTHER&from=2026-09-25&to=2026-09-25&search=Corrected&pageSize=1', manager)).json(); assert.equal(list.total, 1);
    assert.equal((await f.request('/expenses?expenseType=INVALID', admin)).status, 400);
    assert.equal((await f.request(`/expenses/${own.body.id}`, manager, 'PATCH', {})).status, 400);
  });
});
