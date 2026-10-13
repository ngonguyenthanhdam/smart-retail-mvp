require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomBytes, randomUUID } = require('node:crypto');
const { prepareTestEnvironment } = require('./test-database.cjs');
prepareTestEnvironment();
const { NestFactory } = require('@nestjs/core');
const bcrypt = require('bcrypt');
const { AppModule } = require('../dist/src/app.module.js');
const { configureApp } = require('../dist/src/config/configure-app.js');
const { PrismaService } = require('../dist/src/database/prisma.service.js');
const { ResetMailer } = require('../dist/src/auth/reset-mailer.service.js');

test('User administration, role assignment and account access integration', { timeout: 120_000 }, async (t) => {
  const prefix = `usr_${randomUUID().slice(0, 8)}`;
  const password = randomBytes(18).toString('hex');
  const userIds = [], locationIds = [];
  let sequence = 0, app, prisma;
  t.after(async () => {
    try {
      if (prisma) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
      }
    } finally { if (app) await app.close(); }
  });
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  configureApp(app); await app.listen(0, '127.0.0.1');
  prisma = app.get(PrismaService);
  const base = await app.getUrl();
  const roles = Object.fromEntries((await prisma.role.findMany()).map((role) => [role.code, role.id]));
  const passwordHash = await bcrypt.hash(password, 12);
  async function fixtureLocation(type = 'STORE', extra = {}) {
    const row = await prisma.location.create({ data: { code: `${prefix}_${++sequence}`, name: `${prefix} Store ${sequence}`, locationType: type, createdAt: new Date(), ...extra } });
    locationIds.push(row.id); return row;
  }
  async function fixtureUser(role, locationId = null, extra = {}) {
    const row = await prisma.user.create({ data: { username: `${prefix}_${++sequence}`, email: `${prefix}_${sequence}@example.test`, fullName: `${prefix} User ${sequence}`, roleId: roles[role], locationId, passwordHash, createdAt: new Date(), ...extra } });
    userIds.push(row.id); return row;
  }
  const admin = await fixtureUser('ADMIN');
  const storeA = await fixtureLocation(), storeB = await fixtureLocation();
  const warehouse = await fixtureLocation('CENTRAL_WAREHOUSE');
  const inactiveStore = await fixtureLocation('STORE', { isActive: false });
  const deletedStore = await fixtureLocation('STORE', { deletedAt: new Date() });
  const manager = await fixtureUser('STORE_MANAGER', storeA.id), staff = await fixtureUser('STAFF', storeA.id);
  async function request(path, method = 'GET', body, cookie, origin = process.env.FRONTEND_ORIGIN) {
    return fetch(base + path, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  const login = (user, supplied = password) => request('/auth/login', 'POST', { identifier: user.username, password: supplied });
  async function cookieFor(user) { const res = await login(user); assert.equal(res.status, 200); return res.headers.get('set-cookie').split(';')[0]; }
  const adminCookie = await cookieFor(admin), managerCookie = await cookieFor(manager), staffCookie = await cookieFor(staff);
  const patch = (id, body, cookie = adminCookie) => request(`/users/${id}`, 'PATCH', body, cookie);
  function values(extra = {}) { const n = ++sequence; return { username: `${prefix}_${n}`, email: `${prefix}_${n}@example.test`, fullName: `${prefix} Account ${n}`, role: 'ADMIN', password, ...extra }; }
  async function create(body, cookie = adminCookie) {
    const response = await request('/users', 'POST', body, cookie);
    const result = await response.json();
    if (response.status === 201) userIds.push(result.id);
    return { response, result };
  }
  const safeKeys = ['id', 'username', 'email', 'fullName', 'role', 'locationId', 'location', 'isActive', 'createdAt', 'updatedAt'].sort();
  const assertSafe = (body) => {
    assert.deepEqual(Object.keys(body).sort(), safeKeys);
    assert.equal(/password|token|hash/i.test(JSON.stringify(Object.keys(body))), false);
  };

  await t.test('Only ADMIN may list, view, create or edit users', async () => {
    for (const cookie of [undefined, managerCookie, staffCookie]) {
      const expected = cookie ? 403 : 401;
      for (const [path, method, body] of [['/users', 'GET'], [`/users/${staff.id}`, 'GET'], ['/users', 'POST', values()], [`/users/${staff.id}`, 'PATCH', { fullName: 'Changed' }]]) {
        assert.equal((await request(path, method, body, cookie)).status, expected);
      }
    }
  });
  let newAdmin, newManager, newStaff;
  await t.test('ADMIN creates all three roles with valid assignments and bcrypt-only password storage', async () => {
    for (const role of ['ADMIN', 'STORE_MANAGER', 'STAFF']) {
      const { response, result } = await create(values({ role, locationId: role === 'ADMIN' ? null : storeA.id }));
      assert.equal(response.status, 201); assertSafe(result); assert.equal(result.role, role);
      assert.equal(result.locationId, role === 'ADMIN' ? null : storeA.id);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: result.id } });
      assert.notEqual(stored.passwordHash, password); assert.equal(bcrypt.getRounds(stored.passwordHash), 12);
      assert.equal(await bcrypt.compare(password, stored.passwordHash), true);
      assert.equal((await login(result)).status, 200);
      if (role === 'ADMIN') newAdmin = result;
      else if (role === 'STORE_MANAGER') newManager = result;
      else newStaff = result;
    }
  });
  await t.test('Manager and staff require a single active nondeleted STORE', async () => {
    for (const role of ['STORE_MANAGER', 'STAFF']) {
      for (const locationId of [null, warehouse.id, inactiveStore.id, deletedStore.id, randomUUID()]) {
        assert.equal((await create(values({ role, locationId }))).response.status, 400);
      }
    }
    assert.equal((await create(values({ role: 'STAFF', locationId: null, isActive: false }))).response.status, 400);
    assert.equal((await create(values({ role: 'ADMIN', locationId: inactiveStore.id }))).response.status, 400);
  });
  await t.test('Duplicate identifiers and cross-column login collisions return conflict', async () => {
    for (const extra of [{ username: admin.username }, { email: admin.email }, { username: admin.email }, { email: `${prefix}_mail@example.test` }]) {
      if (extra.email === `${prefix}_mail@example.test`) {
        await fixtureUser('ADMIN', null, { username: extra.email });
      }
      const duplicate = await create(values(extra));
      assert.equal(duplicate.response.status, 409);
      assert.match(duplicate.result.message, /username|email/i);
    }
    assert.equal((await patch(newStaff.id, { email: admin.email })).status, 409);
    const deleted = await fixtureUser('ADMIN', null, { deletedAt: new Date() });
    assert.equal((await create(values({ username: deleted.username }))).response.status, 409);
  });
  await t.test('Only whitelisted fields, valid role/email/password and correct scalar types are accepted', async () => {
    for (const body of [null, [], {}, values({ role: 'OWNER' }), values({ email: 'invalid' }), values({ password: 'short' }), values({ password: 'a'.repeat(73) }), values({ username: '' }), values({ fullName: 'x'.repeat(151) }), values({ isActive: null }), values({ locationId: [storeA.id] }), values({ roleId: roles.ADMIN }), values({ passwordHash: 'secret' })]) {
      assert.equal((await create(body)).response.status, 400);
    }
    for (const body of [{}, { username: 'rename' }, { password }, { passwordResetTokenHash: 'raw' }, { deletedAt: null }, { role: 'OWNER' }, { locationId: '' }, { isActive: 'false' }, { email: null }]) {
      assert.equal((await patch(staff.id, body)).status, 400);
    }
    assert.equal((await patch('invalid', { fullName: 'Name' })).status, 400);
  });
  await t.test('List filters and pagination expose safe fields and exclude deleted accounts', async () => {
    const res = await request(`/users?search=${prefix.toUpperCase()}&role=STAFF&status=active&pageSize=1`, 'GET', undefined, adminCookie);
    assert.equal(res.status, 200); const first = await res.json();
    assert.equal(first.items.length, 1); assert.equal(first.total, 2); assertSafe(first.items[0]);
    const second = await (await request(`/users?search=${prefix}&role=STAFF&status=active&pageSize=1&page=2`, 'GET', undefined, adminCookie)).json();
    assert.notEqual(first.items[0].id, second.items[0].id);
    const detail = await request(`/users/${staff.id}`, 'GET', undefined, adminCookie); assertSafe(await detail.json());
    for (const query of ['page=0', 'pageSize=101', 'role=OWNER', 'status=unknown', 'page=1&page=2', 'unknown=1']) {
      assert.equal((await request(`/users?${query}`, 'GET', undefined, adminCookie)).status, 400);
    }
  });
  await t.test('ADMIN edits contact details while username and password remain unchanged', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: newStaff.id } });
    const res = await patch(newStaff.id, { fullName: 'Updated Staff', email: `${prefix}_updated@example.test` });
    assert.equal(res.status, 200); const result = await res.json(); assertSafe(result);
    assert.equal(result.username, before.username); assert.equal(result.fullName, 'Updated Staff');
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: newStaff.id } })).passwordHash, before.passwordHash);
  });
  await t.test('Deactivation immediately denies login and existing-cookie access; reactivation restores access', async () => {
    const cookie = await cookieFor(newStaff);
    assert.equal((await patch(newStaff.id, { isActive: false })).status, 200);
    assert.equal((await login(newStaff)).status, 401);
    assert.equal((await request('/auth/me', 'GET', undefined, cookie)).status, 401);
    assert.equal((await patch(newStaff.id, { isActive: true })).status, 200);
    assert.equal((await login(newStaff)).status, 200);
  });
  await t.test('Soft-deleted accounts cannot login, appear in lists, be read or edited', async () => {
    const deleted = await fixtureUser('STAFF', storeA.id, { deletedAt: new Date() });
    assert.equal((await login(deleted)).status, 401);
    assert.equal((await request(`/users/${deleted.id}`, 'GET', undefined, adminCookie)).status, 404);
    assert.equal((await patch(deleted.id, { isActive: true })).status, 404);
    const list = await (await request(`/users?search=${deleted.username}`, 'GET', undefined, adminCookie)).json();
    assert.equal(list.total, 0);
    assert.equal((await patch(randomUUID(), { fullName: 'Missing' })).status, 404);
    assert.equal((await request(`/users/${staff.id}`, 'DELETE', undefined, adminCookie)).status, 404);
  });
  await t.test('Email changes and deactivation invalidate outstanding password-reset links', async () => {
    let resetUrl;
    app.get(ResetMailer).sendPasswordReset = async (_email, url) => { resetUrl = url; };
    for (const changes of [{ email: `${prefix}_changed@example.test` }, { isActive: false }]) {
      const current = await prisma.user.findUniqueOrThrow({ where: { id: newManager.id } });
      assert.equal((await request('/auth/forgot-password', 'POST', { email: current.email })).status, 200);
      assert.ok(resetUrl); const token = new URL(resetUrl).hash.split('=')[1];
      assert.equal((await patch(newManager.id, changes)).status, 200);
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: newManager.id } });
      assert.equal(updated.passwordResetTokenHash, null); assert.equal(updated.passwordResetExpiresAt, null);
      assert.equal((await request('/auth/reset-password', 'POST', { token, newPassword: password })).status, 400);
    }
  });
  await t.test('Invalid role/location changes cannot be saved and role promotion may clear the store', async () => {
    for (const role of ['STORE_MANAGER', 'STAFF']) {
      assert.equal((await patch(newAdmin.id, { role })).status, 400);
      assert.equal((await patch(newAdmin.id, { role, locationId: warehouse.id })).status, 400);
    }
    assert.equal((await patch(newAdmin.id, { role: 'STORE_MANAGER', locationId: storeB.id })).status, 200);
    const promoted = await patch(newAdmin.id, { role: 'ADMIN' }); assert.equal(promoted.status, 200);
    assert.equal((await promoted.json()).locationId, null);
    assert.equal((await patch(newAdmin.id, { role: 'STAFF', locationId: storeA.id })).status, 200);
    assert.equal((await patch(newAdmin.id, { locationId: null })).status, 400);
  });
  await t.test('Role and store changes are reloaded on existing cookies and enforce new scope immediately', async () => {
    const cookie = await cookieFor(staff);
    assert.equal((await patch(staff.id, { role: 'STORE_MANAGER', locationId: storeB.id })).status, 200);
    const me = await (await request('/auth/me', 'GET', undefined, cookie)).json();
    assert.equal(me.role, 'STORE_MANAGER'); assert.equal(me.locationId, storeB.id);
    assert.equal((await request(`/locations/${storeA.id}`, 'GET', undefined, cookie)).status, 403);
    assert.equal((await request(`/locations/${storeB.id}`, 'GET', undefined, cookie)).status, 200);
    assert.equal((await request('/users', 'GET', undefined, cookie)).status, 403);
    assert.equal((await patch(staff.id, { role: 'ADMIN', locationId: null })).status, 200);
    assert.equal((await request('/users', 'GET', undefined, cookie)).status, 200);
    assert.equal((await patch(staff.id, { role: 'STAFF', locationId: storeB.id })).status, 200);
    assert.equal((await request('/users', 'GET', undefined, cookie)).status, 403);
  });
  await t.test('Inactive assignments may retain details, but reactivation or new assignment requires an active store', async () => {
    const account = await fixtureUser('STAFF', inactiveStore.id, { isActive: false });
    assert.equal((await patch(account.id, { fullName: 'Updated inactive account' })).status, 200);
    assert.equal((await patch(account.id, { isActive: true })).status, 400);
    assert.equal((await patch(account.id, { role: 'STORE_MANAGER' })).status, 400);
    assert.equal((await patch(account.id, { locationId: storeA.id, isActive: true })).status, 200);
  });
  await t.test('An administrator cannot self-deactivate or self-demote even with other administrators', async () => {
    for (const changes of [{ isActive: false }, { role: 'STAFF', locationId: storeA.id }]) {
      assert.equal((await patch(admin.id, changes)).status, 409);
    }
    assert.equal((await patch(admin.id, { fullName: 'Updated Administrator' })).status, 200);
  });
  await t.test('Concurrent identifier creation produces one account and one controlled conflict', async () => {
    const body = values({ role: 'STAFF', locationId: storeA.id });
    const results = await Promise.all([create(body), create(body)]);
    assert.deepEqual(results.map(({ response }) => response.status).sort(), [201, 409]);
  });
  await t.test('Concurrent store deactivation and reassignment cannot save an active account at an inactive store', async () => {
    const target = await fixtureLocation();
    const result = await Promise.all([
      patch(newStaff.id, { locationId: target.id }),
      request(`/locations/${target.id}`, 'PATCH', { isActive: false }, adminCookie),
    ]);
    assert.ok(result.every((response) => [200, 400, 409].includes(response.status)));
    assert.ok(result.some((response) => response.status === 200));
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: newStaff.id }, include: { location: true } });
    assert.equal(saved.isActive && saved.location?.isActive !== true, false);
  });
  await t.test('Concurrent store conversion and assignment preserve STORE type for staff', async () => {
    const target = await fixtureLocation();
    await prisma.location.update({ where: { id: warehouse.id }, data: { isActive: false } });
    const responses = await Promise.all([
      patch(newStaff.id, { locationId: target.id }),
      request(`/locations/${target.id}`, 'PATCH', { locationType: 'CENTRAL_WAREHOUSE' }, adminCookie),
    ]);
    assert.ok(responses.every((response) => [200, 400, 409].includes(response.status)));
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: newStaff.id }, include: { location: true } });
    assert.equal(saved.location.locationType, 'STORE');
  });
  await t.test('Cross-origin browser writes cannot change accounts', async () => {
    assert.equal((await request(`/users/${newStaff.id}`, 'PATCH', { isActive: false }, adminCookie, 'https://untrusted.example.test')).status, 403);
  });
  await t.test('Concurrent administrators disabling each other cannot remove the last active ADMIN', async () => {
    const second = await fixtureUser('ADMIN');
    await prisma.user.updateMany({ where: { id: { in: userIds, notIn: [admin.id, second.id] }, role: { code: 'ADMIN' } }, data: { isActive: false } });
    assert.equal(await prisma.user.count({ where: { isActive: true, deletedAt: null, role: { code: 'ADMIN' } } }), 2);
    const secondCookie = await cookieFor(second);
    for (let attempt = 0; attempt < 5; attempt++) {
      await prisma.user.updateMany({ where: { id: { in: [admin.id, second.id] } }, data: { isActive: true } });
      const results = await Promise.all([patch(second.id, { isActive: false }, adminCookie), patch(admin.id, { isActive: false }, secondCookie)]);
      assert.equal(results.filter((response) => response.status === 200).length, 1);
      assert.ok(results.every((response) => [200, 401, 403, 409].includes(response.status)), `Unexpected statuses: ${results.map((response) => response.status).join(', ')}`);
      assert.equal(await prisma.user.count({ where: { isActive: true, deletedAt: null, role: { code: 'ADMIN' } } }), 1);
    }
    const remaining = await prisma.user.findFirstOrThrow({ where: { isActive: true, deletedAt: null, role: { code: 'ADMIN' } } });
    assert.equal(await prisma.user.count({ where: { isActive: true, deletedAt: null, role: { code: 'ADMIN' } } }), 1);
    assert.equal((await patch(remaining.id, { isActive: false }, await cookieFor(remaining))).status, 409);
  });
});
