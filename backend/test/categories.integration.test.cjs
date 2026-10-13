const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');

test('Category management, hierarchy and authorization', async (t) => {
  const f = await catalogFixture(t);
  const admin = f.cookies.ADMIN;
  let root, child;
  await t.test('Admin creates categories with optional parent and unique code', async () => {
    let r = await f.create('/categories', 'category', admin, { code: f.code(), name: 'Food' });
    assert.equal(r.status, 201); root = r.body;
    r = await f.create('/categories', 'category', admin, { code: f.code(), name: 'Milk', parentId: root.id });
    assert.equal(r.status, 201); child = r.body; assert.equal(child.parent.id, root.id);
    assert.equal((await f.create('/categories', 'category', admin, { code: root.code, name: 'Duplicate' })).status, 409);
  });
  await t.test('Backend denies anonymous and non-admin master access', async () => {
    assert.equal((await f.request('/categories')).status, 401);
    for (const cookie of [f.cookies.STORE_MANAGER, f.cookies.STAFF]) {
      assert.equal((await f.request('/categories', cookie)).status, 403);
      assert.equal((await f.request('/categories', cookie, 'POST', { code: f.code(), name: 'Denied' })).status, 403);
      assert.equal((await f.request(`/categories/${root.id}`, cookie, 'PATCH', { name: 'Denied' })).status, 403);
    }
  });
  await t.test('Self-parenting and longer cycles are rejected', async () => {
    for (const parentId of [root.id, child.id]) assert.equal((await f.request(`/categories/${root.id}`, admin, 'PATCH', { parentId })).status, 409);
  });
  await t.test('Deactivate requires inactive children; active children require active parent', async () => {
    assert.equal((await f.request(`/categories/${root.id}`, admin, 'PATCH', { isActive: false })).status, 409);
    assert.equal((await f.request(`/categories/${child.id}`, admin, 'PATCH', { isActive: false })).status, 200);
    assert.equal((await f.request(`/categories/${root.id}`, admin, 'PATCH', { isActive: false })).status, 200);
    assert.equal((await f.request(`/categories/${child.id}`, admin, 'PATCH', { isActive: true })).status, 409);
    assert.equal((await f.request(`/categories/${child.id}`, admin, 'PATCH', { parentId: null, isActive: true })).status, 200);
  });
  await t.test('List supports search/status/pagination; validation rejects unknown fields', async () => {
    const r = await f.request(`/categories?search=${root.code}&status=inactive&pageSize=1`, admin);
    const body = await r.json(); assert.equal(body.total, 1); assert.equal(body.items[0].id, root.id);
    assert.equal((await f.request('/categories?pageSize=101', admin)).status, 400);
    assert.equal((await f.request(`/categories/${root.id}`, admin, 'PATCH', { quantity: 1 })).status, 400);
    assert.equal((await f.request(`/categories/${root.id}`, admin, 'DELETE')).status, 404);
  });
  await t.test('Nullable inactive status remains searchable', async () => {
    const row = await f.fixture('category', { code: f.code(), name: 'Legacy inactive', isActive: null, createdAt: new Date() });
    const response = await f.request(`/categories?status=inactive&search=${row.code}`, admin);
    const body = await response.json(); assert.equal(body.total, 1); assert.equal(body.items[0].id, row.id);
  });
});
