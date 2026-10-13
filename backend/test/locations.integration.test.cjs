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

test('Location administration and store access boundaries', { timeout: 90_000 }, async (t) => {
  const namespace = `loc_${randomUUID().slice(0, 8)}`;
  const password = randomBytes(24).toString('hex');
  const userIds = [];
  const locationIds = [];
  let sequence = 0;
  let app;
  let prisma;

  t.after(async () => {
    try {
      if (prisma) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
      }
    } finally {
      if (app) await app.close();
    }
  });

  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  prisma = app.get(PrismaService);
  const baseUrl = await app.getUrl();
  const roles = Object.fromEntries((await prisma.role.findMany()).map((role) => [role.code, role.id]));
  const passwordHash = await bcrypt.hash(password, 12);
  const safeKeys = [
    'id', 'code', 'name', 'locationType', 'address', 'district', 'city',
    'isActive', 'createdAt', 'updatedAt',
  ].sort();

  async function request(path, { method = 'GET', body, cookie, origin = process.env.FRONTEND_ORIGIN } = {}) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        Origin: origin,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
  }

  async function createFixtureLocation(overrides = {}) {
    const location = await prisma.location.create({
      data: {
        code: `${namespace}_${++sequence}`, name: `${namespace} Store ${sequence}`,
        locationType: 'STORE', createdAt: new Date(), updatedAt: new Date(), ...overrides,
      },
    });
    locationIds.push(location.id);
    return location;
  }

  async function createFixtureUser(role, locationId = null, overrides = {}) {
    const suffix = ++sequence;
    const user = await prisma.user.create({
      data: {
        username: `${namespace}_${suffix}`, email: `${namespace}_${suffix}@example.test`,
        fullName: `Location Test ${suffix}`, roleId: roles[role], locationId,
        passwordHash, createdAt: new Date(), updatedAt: new Date(), ...overrides,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function login(user) {
    const response = await request('/auth/login', {
      method: 'POST', body: { identifier: user.username, password },
    });
    assert.equal(response.status, 200);
    const header = response.headers.get('set-cookie');
    assert.ok(header);
    return header.split(';')[0];
  }

  const storeA = await createFixtureLocation();
  const storeB = await createFixtureLocation();
  const inactiveStore = await createFixtureLocation({ isActive: false });
  const deletedStore = await createFixtureLocation({ deletedAt: new Date() });
  const admin = await createFixtureUser('ADMIN');
  const manager = await createFixtureUser('STORE_MANAGER', storeA.id);
  const staff = await createFixtureUser('STAFF', storeA.id);
  const adminCookie = await login(admin);
  const managerCookie = await login(manager);
  const staffCookie = await login(staff);

  function validLocation(overrides = {}) {
    return {
      code: `${namespace}_${++sequence}`, name: `${namespace} Created ${sequence}`,
      locationType: 'STORE', ...overrides,
    };
  }

  async function createLocation(body) {
    const response = await request('/locations', { method: 'POST', body, cookie: adminCookie });
    const result = await response.json();
    if (response.status === 201 && result.id) locationIds.push(result.id);
    return { response, result };
  }

  async function updateLocation(id, body, cookie = adminCookie) {
    return request(`/locations/${id}`, { method: 'PATCH', body, cookie });
  }

  await t.test('Unauthenticated requests cannot list, read, create or update locations', async () => {
    for (const [path, options] of [
      ['/locations', {}],
      [`/locations/${storeA.id}`, {}],
      ['/locations', { method: 'POST', body: validLocation() }],
      [`/locations/${storeA.id}`, { method: 'PATCH', body: { name: 'Changed' } }],
    ]) {
      assert.equal((await request(path, options)).status, 401);
    }
  });

  await t.test('Managers and staff can read only their own store and cannot use administration endpoints', async () => {
    for (const cookie of [managerCookie, staffCookie]) {
      const own = await request(`/locations/${storeA.id}`, { cookie });
      assert.equal(own.status, 200);
      const body = await own.json();
      assert.equal(body.id, storeA.id);
      assert.deepEqual(Object.keys(body).sort(), safeKeys);
      assert.equal((await request(`/locations/${storeB.id}`, { cookie })).status, 403);
      assert.equal((await request(`/locations/${randomUUID()}`, { cookie })).status, 403);
      assert.equal((await request('/locations', { cookie })).status, 403);
      assert.equal((await request('/locations', { method: 'POST', body: validLocation(), cookie })).status, 403);
      assert.equal((await updateLocation(storeA.id, { name: 'Changed' }, cookie)).status, 403);
    }
    assert.equal((await prisma.location.findUniqueOrThrow({ where: { id: storeA.id } })).name, storeA.name);
  });

  await t.test('ADMIN can create and read a store with trimmed input, nullable fields and active status by default', async () => {
    const input = validLocation({
      address: '  15 Test Road  ', district: null, city: '  Test City  ',
      externalSource: undefined,
    });
    const { response, result } = await createLocation({ ...input, code: ` ${input.code} `, name: ` ${input.name} ` });
    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(result).sort(), safeKeys);
    assert.equal(result.code, input.code);
    assert.equal(result.name, input.name);
    assert.equal(result.address, '15 Test Road');
    assert.equal(result.district, null);
    assert.equal(result.city, 'Test City');
    assert.equal(result.isActive, true);
    assert.equal(result.locationType, 'STORE');
    assert.ok(Number.isFinite(Date.parse(result.createdAt)));
    assert.ok(Number.isFinite(Date.parse(result.updatedAt)));
    const detail = await request(`/locations/${result.id}`, { cookie: adminCookie });
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), result);
  });

  await t.test('Search, type and status filters return only matching nondeleted locations with bounded pagination', async () => {
    const path = `/locations?search=${namespace.toUpperCase()}&page=1&pageSize=2`;
    const response = await request(path, { cookie: adminCookie });
    assert.equal(response.status, 200);
    const first = await response.json();
    assert.deepEqual(Object.keys(first).sort(), ['items', 'page', 'pageSize', 'total']);
    assert.equal(first.page, 1);
    assert.equal(first.pageSize, 2);
    assert.equal(first.items.length, 2);
    assert.equal(first.total, await prisma.location.count({ where: { id: { in: locationIds }, deletedAt: null } }));
    for (const item of first.items) assert.deepEqual(Object.keys(item).sort(), safeKeys);
    const secondResponse = await request(`/locations?search=${namespace}&page=2&pageSize=2`, { cookie: adminCookie });
    assert.equal(secondResponse.status, 200);
    const second = await secondResponse.json();
    assert.equal(second.page, 2);
    assert.equal(second.total, first.total);
    assert.equal(second.items.some((item) => first.items.some((prior) => prior.id === item.id)), false);

    const activeResponse = await request(`/locations?search=${namespace}&type=STORE&status=active&pageSize=100`, { cookie: adminCookie });
    assert.equal(activeResponse.status, 200);
    const active = await activeResponse.json();
    assert.ok(active.items.length > 0);
    assert.ok(active.items.every((item) => item.locationType === 'STORE' && item.isActive === true));
    assert.equal(active.items.some((item) => [inactiveStore.id, deletedStore.id].includes(item.id)), false);
    const inactiveResponse = await request(`/locations?search=${namespace}&status=inactive`, { cookie: adminCookie });
    assert.equal(inactiveResponse.status, 200);
    assert.deepEqual((await inactiveResponse.json()).items.map((item) => item.id), [inactiveStore.id]);
    const noMatch = await request(`/locations?search=missing_${namespace}`, { cookie: adminCookie });
    assert.equal(noMatch.status, 200);
    assert.deepEqual((await noMatch.json()).items, []);
  });

  await t.test('ADMIN can edit location details and deactivate or reactivate an unassigned store', async () => {
    const updatedCode = `${namespace}_${++sequence}`;
    const updated = await updateLocation(storeB.id, {
      code: updatedCode, name: 'Updated Store', address: 'A new address', district: 'District 2', city: 'A city',
    });
    assert.equal(updated.status, 200);
    const result = await updated.json();
    assert.equal(result.id, storeB.id);
    assert.equal(result.code, updatedCode);
    assert.equal(result.name, 'Updated Store');
    assert.equal(result.locationType, 'STORE');
    assert.equal(result.isActive, true);
    assert.equal(new Date(result.createdAt).getTime(), storeB.createdAt.getTime());
    assert.ok(new Date(result.updatedAt).getTime() >= storeB.updatedAt.getTime());
    const deactivated = await updateLocation(storeB.id, { isActive: false, address: null, district: null, city: null });
    assert.equal(deactivated.status, 200);
    const inactive = await deactivated.json();
    assert.equal(inactive.isActive, false);
    assert.equal(inactive.address, null);
    assert.equal(inactive.district, null);
    assert.equal(inactive.city, null);
    const reactivated = await updateLocation(storeB.id, { isActive: true });
    assert.equal(reactivated.status, 200);
    assert.equal((await reactivated.json()).isActive, true);
  });

  await t.test('Duplicate codes, including a soft-deleted record code, return 409 without overwriting data', async () => {
    for (const code of [storeA.code, deletedStore.code]) {
      const { response } = await createLocation(validLocation({ code }));
      assert.equal(response.status, 409);
      assert.equal((await updateLocation(storeB.id, { code })).status, 409);
    }
    assert.equal((await prisma.location.findUniqueOrThrow({ where: { id: storeB.id } })).name, 'Updated Store');
  });

  await t.test('Malformed location bodies, immutable database fields and empty patches receive 400', async () => {
    for (const body of [
      null, [], {}, { code: 'ONLY_CODE' }, validLocation({ code: '' }),
      validLocation({ code: 'x'.repeat(31) }), validLocation({ name: 'x'.repeat(151) }),
      validLocation({ locationType: 'WAREHOUSE' }), validLocation({ locationType: ['STORE'] }),
      validLocation({ isActive: 'false' }), validLocation({ isActive: null }),
      validLocation({ address: [] }), validLocation({ district: 'x'.repeat(101) }),
      validLocation({ city: 'x'.repeat(101) }), validLocation({ deletedAt: new Date().toISOString() }),
      validLocation({ externalSource: 'external' }), validLocation({ id: randomUUID() }),
    ]) {
      assert.equal((await createLocation(body)).response.status, 400);
    }
    for (const body of [
      null, [], {}, { name: '' }, { name: null }, { code: null }, { isActive: 'true' },
      { locationType: 'unknown' }, { createdAt: new Date().toISOString() }, { deletedAt: null },
    ]) {
      assert.equal((await updateLocation(storeB.id, body)).status, 400);
    }
  });

  await t.test('Invalid query filters and UUID parameters receive 400', async () => {
    for (const query of [
      'page=0', 'page=-1', 'page=1.5', 'page=abc', 'pageSize=0', 'pageSize=101',
      'pageSize=1.5', 'type=WAREHOUSE', 'status=unknown', 'page=1&page=2',
    ]) {
      assert.equal((await request(`/locations?${query}`, { cookie: adminCookie })).status, 400);
    }
    assert.equal((await request('/locations/not-a-uuid', { cookie: adminCookie })).status, 400);
    assert.equal((await updateLocation('not-a-uuid', { name: 'Changed' })).status, 400);
  });

  await t.test('Missing or soft-deleted locations cannot be read or updated, and no delete endpoint exists', async () => {
    for (const id of [randomUUID(), deletedStore.id]) {
      assert.equal((await request(`/locations/${id}`, { cookie: adminCookie })).status, 404);
      assert.equal((await updateLocation(id, { name: 'Changed' })).status, 404);
    }
    assert.equal((await request(`/locations/${storeA.id}`, { method: 'DELETE', cookie: adminCookie })).status, 404);
    assert.equal((await prisma.location.findUniqueOrThrow({ where: { id: deletedStore.id } })).name, deletedStore.name);
  });

  await t.test('An assigned active account of any role blocks deactivation until moved or disabled', async () => {
    for (const role of ['ADMIN', 'STORE_MANAGER', 'STAFF']) {
      const location = await createFixtureLocation();
      const account = await createFixtureUser(role, location.id);
      const blocked = await updateLocation(location.id, { isActive: false });
      assert.equal(blocked.status, 409);
      assert.equal((await prisma.location.findUniqueOrThrow({ where: { id: location.id } })).isActive, true);
      if (role === 'ADMIN') {
        await prisma.user.update({ where: { id: account.id }, data: { locationId: null } });
      } else {
        await prisma.user.update({ where: { id: account.id }, data: { isActive: false } });
      }
      assert.equal((await updateLocation(location.id, { isActive: false })).status, 200);
    }
    const location = await createFixtureLocation();
    await createFixtureUser('STAFF', location.id, { deletedAt: new Date() });
    assert.equal((await updateLocation(location.id, { isActive: false })).status, 200);
  });

  await t.test('A store assigned to a manager or staff cannot become a warehouse even when the account is inactive', async () => {
    for (const role of ['STORE_MANAGER', 'STAFF']) {
      const location = await createFixtureLocation({ isActive: false });
      const account = await createFixtureUser(role, location.id, { isActive: false });
      const blocked = await updateLocation(location.id, { locationType: 'CENTRAL_WAREHOUSE' });
      assert.equal(blocked.status, 409);
      assert.equal((await prisma.location.findUniqueOrThrow({ where: { id: location.id } })).locationType, 'STORE');
      await prisma.user.update({ where: { id: account.id }, data: { deletedAt: new Date() } });
      const allowed = await updateLocation(location.id, { locationType: 'CENTRAL_WAREHOUSE' });
      assert.equal(allowed.status, 200);
      assert.equal((await allowed.json()).locationType, 'CENTRAL_WAREHOUSE');
    }
  });

  await t.test('Only one active central warehouse can be created or activated while inactive warehouses are allowed', async () => {
    assert.equal(await prisma.location.count({ where: { locationType: 'CENTRAL_WAREHOUSE', isActive: true, deletedAt: null } }), 0,
      'The isolated test database must have no leftover active warehouse before this scenario.');
    const first = await createLocation(validLocation({ locationType: 'CENTRAL_WAREHOUSE' }));
    assert.equal(first.response.status, 201);
    assert.equal(first.result.locationType, 'CENTRAL_WAREHOUSE');
    const second = await createLocation(validLocation({ locationType: 'CENTRAL_WAREHOUSE' }));
    assert.equal(second.response.status, 409);
    const inactive = await createLocation(validLocation({ locationType: 'CENTRAL_WAREHOUSE', isActive: false }));
    assert.equal(inactive.response.status, 201);
    assert.equal((await updateLocation(inactive.result.id, { isActive: true })).status, 409);
    assert.equal((await updateLocation(storeB.id, { locationType: 'CENTRAL_WAREHOUSE' })).status, 409);
    assert.equal((await updateLocation(first.result.id, { name: 'Central Warehouse Updated' })).status, 200);
    assert.equal((await updateLocation(first.result.id, { isActive: false })).status, 200);
    assert.equal((await updateLocation(inactive.result.id, { isActive: true })).status, 200);
    assert.equal((await updateLocation(inactive.result.id, { isActive: false })).status, 200);
  });

  await t.test('Concurrent central warehouse creation preserves the single active warehouse invariant', async () => {
    const results = await Promise.all([
      createLocation(validLocation({ locationType: 'CENTRAL_WAREHOUSE' })),
      createLocation(validLocation({ locationType: 'CENTRAL_WAREHOUSE' })),
    ]);
    assert.deepEqual(results.map(({ response }) => response.status).sort(), [201, 409]);
    assert.equal(await prisma.location.count({ where: { locationType: 'CENTRAL_WAREHOUSE', isActive: true, deletedAt: null } }), 1);
    const winner = results.find(({ response }) => response.status === 201).result;
    assert.equal((await updateLocation(winner.id, { isActive: false })).status, 200);
  });

  await t.test('Cross-origin browser mutations are rejected without changing stored data', async () => {
    const before = await prisma.location.findUniqueOrThrow({ where: { id: storeB.id } });
    const response = await request(`/locations/${storeB.id}`, {
      method: 'PATCH', body: { name: 'Untrusted change' }, cookie: adminCookie,
      origin: 'https://untrusted.example.test',
    });
    assert.equal(response.status, 403);
    assert.equal((await prisma.location.findUniqueOrThrow({ where: { id: storeB.id } })).name, before.name);
  });
});
