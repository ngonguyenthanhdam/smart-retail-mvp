require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomBytes, randomUUID } = require('node:crypto');
const { prepareTestEnvironment } = require('./test-database.cjs');

prepareTestEnvironment();

const { NestFactory } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const bcrypt = require('bcrypt');
const { AppModule } = require('../dist/src/app.module.js');
const { configureApp } = require('../dist/src/config/configure-app.js');
const { PrismaService } = require('../dist/src/database/prisma.service.js');
const { AUTH_COOKIE } = require('../dist/src/auth/auth-cookie.js');
const { seedAuthentication } = require('../dist/prisma/seed.js');

test('Authentication API with the migrated test database', { timeout: 90_000 }, async (t) => {
  const namespace = `auth_${randomUUID().slice(0, 8)}`;
  const password = randomBytes(24).toString('hex');
  const userIds = [];
  const locationIds = [];
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
  const trustedOrigin = process.env.FRONTEND_ORIGIN;

  async function request(path, { method = 'GET', body, cookie, origin } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
  }

  async function login(identifier, suppliedPassword = password, origin = trustedOrigin) {
    return request('/auth/login', {
      method: 'POST', body: { identifier, password: suppliedPassword }, origin,
    });
  }

  function cookieFrom(response) {
    const header = response.headers.get('set-cookie');
    assert.ok(header, 'Successful login must set an authentication cookie.');
    return header.split(';')[0];
  }

  const adminConfig = {
    username: `${namespace}_admin`,
    email: `${namespace}_admin@example.test`,
    password,
    fullName: 'Authentication Test Administrator',
  };
  let admin;

  await t.test('Initial seed creates three roles and one administrator with a bcrypt password', async () => {
    assert.equal(await seedAuthentication(prisma, adminConfig), 'created');
    admin = await prisma.user.findUniqueOrThrow({ where: { username: adminConfig.username } });
    userIds.push(admin.id);
    assert.equal(admin.locationId, null);
    assert.equal(await bcrypt.compare(password, admin.passwordHash), true);
    assert.equal(bcrypt.getRounds(admin.passwordHash), 12);
    const codes = (await prisma.role.findMany()).map((role) => role.code).sort();
    assert.deepEqual(codes, ['ADMIN', 'STAFF', 'STORE_MANAGER']);
  });

  assert.ok(admin, 'The initial test administrator must exist before API verification.');

  await t.test('Repeated seed does not duplicate accounts or overwrite an existing password', async () => {
    assert.equal(await seedAuthentication(prisma, {
      ...adminConfig,
      password: randomBytes(24).toString('hex'),
      fullName: 'Changed bootstrap configuration',
    }), 'unchanged');
    const current = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    assert.equal(current.passwordHash === admin.passwordHash, true);
    assert.equal(current.fullName, adminConfig.fullName);
    assert.equal(await prisma.user.count({ where: { username: adminConfig.username } }), 1);
    assert.equal(await prisma.role.count(), 3);
  });

  await t.test('Changed bootstrap identifiers cannot create a second initial administrator', async () => {
    await assert.rejects(seedAuthentication(prisma, {
      ...adminConfig,
      username: `${namespace}_second`,
      email: `${namespace}_second@example.test`,
    }), /administrator already exists/i);
    assert.equal(await prisma.user.count({ where: { username: `${namespace}_second` } }), 0);
  });

  const roles = Object.fromEntries((await prisma.role.findMany()).map((role) => [role.code, role.id]));
  const passwordHash = await bcrypt.hash(password, 12);

  async function createLocation(suffix, locationType = 'STORE') {
    const location = await prisma.location.create({
      data: {
        code: `${namespace}_${suffix}`, name: `Authentication Test ${suffix}`,
        locationType, createdAt: new Date(), updatedAt: new Date(),
      },
    });
    locationIds.push(location.id);
    return location;
  }

  async function createUser(suffix, role, locationId, overrides = {}) {
    const user = await prisma.user.create({
      data: {
        username: `${namespace}_${suffix}`, email: `${namespace}_${suffix}@example.test`,
        fullName: `Authentication Test ${suffix}`, roleId: roles[role], locationId,
        passwordHash, createdAt: new Date(), updatedAt: new Date(), ...overrides,
      },
    });
    userIds.push(user.id);
    return user;
  }

  const storeA = await createLocation('store_a');
  const storeB = await createLocation('store_b');
  const warehouse = await createLocation('warehouse', 'CENTRAL_WAREHOUSE');
  const inactive = await createUser('inactive', 'ADMIN', null, { isActive: false });
  const deleted = await createUser('deleted', 'ADMIN', null, { deletedAt: new Date() });
  const manager = await createUser('manager', 'STORE_MANAGER', storeA.id);
  const staff = await createUser('staff', 'STAFF', storeA.id);
  const mutable = await createUser('mutable', 'STORE_MANAGER', storeA.id);
  let adminCookie;

  await t.test('Valid ADMIN username login returns safe user data and an eight-hour HttpOnly cookie', async () => {
    const response = await login(admin.username);
    assert.equal(response.status, 200);
    adminCookie = cookieFrom(response);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['email', 'fullName', 'id', 'location', 'locationId', 'role', 'username']);
    assert.equal(body.id, admin.id);
    assert.equal(body.role, 'ADMIN');
    assert.equal(body.location, null);
    assert.equal(body.locationId, null);
    const header = response.headers.get('set-cookie');
    assert.match(header, /;\s*HttpOnly/i);
    assert.match(header, /;\s*SameSite=Lax/i);
    assert.match(header, /;\s*Path=\//i);
    assert.doesNotMatch(header, /;\s*Secure/i);
    assert.match(header, /;\s*Max-Age=28800/i);
    const token = decodeURIComponent(adminCookie.slice(AUTH_COOKIE.length + 1));
    const payload = new JwtService().verify(token, { secret: process.env.JWT_SECRET, algorithms: ['HS256'] });
    assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'sub']);
    assert.equal(payload.sub, admin.id);
    assert.equal(payload.exp - payload.iat, 28800);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  await t.test('ADMIN can also sign in using email', async () => {
    const response = await login(admin.email);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).id, admin.id);
  });

  await t.test('An identifier matching two accounts never selects an arbitrary user', async () => {
    await createUser('ambiguous', 'STAFF', storeA.id, { username: staff.email });
    const response = await login(staff.email);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).message, 'Invalid username/email or password.');
  });

  await t.test('Malformed credentials and passwords exceeding bcrypt byte limits are rejected', async () => {
    for (const body of [{}, { identifier: [], password }, { identifier: admin.username, password: 'é'.repeat(37) }]) {
      const response = await request('/auth/login', { method: 'POST', body, origin: trustedOrigin });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).message, 'Invalid username/email or password.');
    }
  });

  for (const [description, identifier, suppliedPassword] of [
    ['Wrong password', admin.username, `${password}wrong`],
    ['Unknown username/email', `${namespace}_unknown@example.test`, password],
    ['Inactive account', inactive.username, password],
    ['Soft-deleted account', deleted.email, password],
  ]) {
    await t.test(`${description} returns the same generic authentication error`, async () => {
      const response = await login(identifier, suppliedPassword);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).message, 'Invalid username/email or password.');
      assert.equal(response.headers.get('set-cookie'), null);
    });
  }

  await t.test('Requests without an authentication cookie receive 401', async () => {
    assert.equal((await request('/auth/me')).status, 401);
  });

  await t.test('Authenticated /auth/me returns the current safe user and avoids caching', async () => {
    const response = await request('/auth/me', { cookie: adminCookie });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['email', 'fullName', 'id', 'location', 'locationId', 'role', 'username']);
    assert.equal(body.id, admin.id);
    assert.equal(body.username, admin.username);
    assert.equal(body.email, admin.email);
    assert.equal(body.fullName, admin.fullName);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  await t.test('Managers and staff receive their assigned store without sensitive fields', async () => {
    for (const account of [manager, staff]) {
      const response = await login(account.username);
      assert.equal(response.status, 200);
      const current = await request('/auth/me', { cookie: cookieFrom(response) });
      assert.equal(current.status, 200);
      const body = await current.json();
      assert.equal(body.locationId, storeA.id);
      assert.deepEqual(body.location, { id: storeA.id, code: storeA.code, name: storeA.name });
      assert.equal('passwordHash' in body || 'password_hash' in body, false);
    }
  });

  await t.test('Invalid signatures, expired tokens, and invalid user subjects receive 401', async () => {
    const jwt = new JwtService();
    const invalidTokens = [
      jwt.sign({ sub: admin.id }, { secret: randomBytes(32).toString('hex'), expiresIn: '8h' }),
      jwt.sign({ sub: admin.id }, { secret: process.env.JWT_SECRET, expiresIn: -1 }),
      jwt.sign({ sub: 'not-a-user-uuid' }, { secret: process.env.JWT_SECRET, expiresIn: '8h' }),
      jwt.sign({ sub: randomUUID() }, { secret: process.env.JWT_SECRET, expiresIn: '8h' }),
      jwt.sign({ sub: admin.id }, { secret: process.env.JWT_SECRET }),
    ];
    for (const token of invalidTokens) {
      const response = await request('/auth/me', { cookie: `${AUTH_COOKIE}=${token}` });
      assert.equal(response.status, 401);
    }
  });

  await t.test('An existing token stops working when the account is deactivated or soft-deleted', async () => {
    const response = await login(mutable.username);
    assert.equal(response.status, 200);
    const cookie = cookieFrom(response);
    try {
      await prisma.user.update({ where: { id: mutable.id }, data: { isActive: false } });
      assert.equal((await request('/auth/me', { cookie })).status, 401);
      await prisma.user.update({ where: { id: mutable.id }, data: { isActive: true, deletedAt: new Date() } });
      assert.equal((await request('/auth/me', { cookie })).status, 401);
    } finally {
      await prisma.user.update({ where: { id: mutable.id }, data: { isActive: true, deletedAt: null } });
    }
  });

  await t.test('Existing tokens use current role and store assignments from the database', async () => {
    const response = await login(mutable.username);
    assert.equal(response.status, 200);
    const cookie = cookieFrom(response);
    try {
      await prisma.user.update({ where: { id: mutable.id }, data: { roleId: roles.STAFF, locationId: storeB.id } });
      const current = await request('/auth/me', { cookie });
      assert.equal(current.status, 200);
      const body = await current.json();
      assert.equal(body.role, 'STAFF');
      assert.equal(body.locationId, storeB.id);
      await prisma.user.update({ where: { id: mutable.id }, data: { locationId: null } });
      assert.equal((await request('/auth/me', { cookie })).status, 401);
    } finally {
      await prisma.user.update({ where: { id: mutable.id }, data: { roleId: roles.STORE_MANAGER, locationId: storeA.id } });
    }
  });

  await t.test('Managers and staff cannot authenticate without a STORE assignment', async () => {
    for (const role of ['STORE_MANAGER', 'STAFF']) {
      for (const locationId of [null, warehouse.id]) {
        await prisma.user.update({ where: { id: mutable.id }, data: { roleId: roles[role], locationId } });
        const response = await login(mutable.username);
        assert.equal(response.status, 401);
        assert.equal((await response.json()).message, 'Invalid username/email or password.');
      }
    }
    await prisma.user.update({ where: { id: mutable.id }, data: { roleId: roles.STORE_MANAGER, locationId: storeA.id } });
  });

  await t.test('Credentialed CORS allows the configured frontend origin', async () => {
    const response = await login(admin.username);
    assert.equal(response.headers.get('access-control-allow-origin'), trustedOrigin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    const preflight = await fetch(`${baseUrl}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: trustedOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), trustedOrigin);
  });

  await t.test('Browser mutations from an untrusted origin are rejected', async () => {
    const origin = 'http://untrusted.example.test';
    const response = await login(admin.username, password, origin);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('set-cookie'), null);
    const logout = await request('/auth/logout', { method: 'POST', cookie: adminCookie, origin });
    assert.equal(logout.status, 403);
    assert.equal(logout.headers.get('set-cookie'), null);
  });

  await t.test('Logout expires the cookie and subsequent requests without it are unauthenticated', async () => {
    const response = await request('/auth/logout', { method: 'POST', cookie: adminCookie, origin: trustedOrigin });
    assert.equal(response.status, 204);
    const header = response.headers.get('set-cookie');
    assert.ok(header);
    assert.ok(header.startsWith(`${AUTH_COOKIE}=;`));
    assert.match(header, /;\s*HttpOnly/i);
    assert.match(header, /;\s*SameSite=Lax/i);
    const expires = /Expires=([^;]+)/i.exec(header)?.[1];
    assert.ok(expires && new Date(expires).getTime() < Date.now());
    assert.equal((await request('/auth/me')).status, 401);
  });
});
