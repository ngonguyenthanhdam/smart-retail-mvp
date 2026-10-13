require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomBytes } = require('node:crypto');
const { Reflector } = require('@nestjs/core');
const { Roles } = require('../dist/src/auth/auth.decorators.js');
const { RolesGuard } = require('../dist/src/auth/roles.guard.js');
const { resolveLocationScope } = require('../dist/src/auth/location-scope.js');
const { AUTH_COOKIE, authCookieOptions, readAuthCookie } = require('../dist/src/auth/auth-cookie.js');
const { validateEnvironment } = require('../dist/src/config/environment.js');
const { loadInitialAdmin } = require('../dist/prisma/seed.js');
const { validateTestDatabase } = require('./test-database.cjs');

const hasStatus = (status) => (error) => error.getStatus?.() === status;

function roleContext(role, allowedRoles, classRoles) {
  class ExampleController {
    action() {}
  }
  if (classRoles) Roles(...classRoles)(ExampleController);
  if (allowedRoles) {
    Roles(...allowedRoles)(ExampleController.prototype, 'action',
      Object.getOwnPropertyDescriptor(ExampleController.prototype, 'action'));
  }
  return {
    getHandler: () => ExampleController.prototype.action,
    getClass: () => ExampleController,
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  };
}

test('RolesGuard rejects STAFF on an ADMIN-only action', () => {
  const guard = new RolesGuard(new Reflector());
  assert.throws(() => guard.canActivate(roleContext('STAFF', ['ADMIN'])), hasStatus(403));
});

test('RolesGuard permits each explicitly allowed role', () => {
  const guard = new RolesGuard(new Reflector());
  for (const role of ['ADMIN', 'STORE_MANAGER']) {
    assert.equal(guard.canActivate(roleContext(role, ['ADMIN', 'STORE_MANAGER'])), true);
  }
});

test('RolesGuard uses controller roles and allows a method-specific override', () => {
  const guard = new RolesGuard(new Reflector());
  assert.throws(() => guard.canActivate(roleContext('STAFF', undefined, ['ADMIN'])), hasStatus(403));
  assert.equal(guard.canActivate(roleContext('STAFF', ['STAFF'], ['ADMIN'])), true);
});

test('RolesGuard requires an authenticated user before checking roles', () => {
  const guard = new RolesGuard(new Reflector());
  assert.throws(() => guard.canActivate(roleContext(undefined, ['ADMIN'])), hasStatus(401));
});

test('Store Manager scope comes from the current account', () => {
  const manager = { role: 'STORE_MANAGER', locationId: 'store-a' };
  assert.equal(resolveLocationScope(manager), 'store-a');
  assert.equal(resolveLocationScope(manager, 'store-a'), 'store-a');
  assert.throws(() => resolveLocationScope(manager, 'store-b'), hasStatus(403));
});

test('Staff cannot request another store', () => {
  const staff = { role: 'STAFF', locationId: 'store-a' };
  assert.equal(resolveLocationScope(staff), 'store-a');
  assert.throws(() => resolveLocationScope(staff, 'store-b'), hasStatus(403));
});

test('ADMIN can request any location or chain-wide scope', () => {
  const admin = { role: 'ADMIN', locationId: null };
  assert.equal(resolveLocationScope(admin, 'store-b'), 'store-b');
  assert.equal(resolveLocationScope(admin), undefined);
});

test('Missing store assignments and unknown roles fail closed', () => {
  for (const role of ['STORE_MANAGER', 'STAFF', 'UNKNOWN']) {
    assert.throws(() => resolveLocationScope({ role, locationId: null }), hasStatus(403));
  }
  assert.throws(() => resolveLocationScope({ role: 'ADMIN', locationId: null }, ' '), hasStatus(403));
});

test('Malformed client location values are rejected with a controlled authorization error', () => {
  for (const value of [null, 0, {}, [], '', ' ']) {
    assert.throws(() => resolveLocationScope({ role: 'ADMIN', locationId: null }, value), hasStatus(403));
  }
});

test('Authentication cookies are HttpOnly, Lax, and Secure only in production', () => {
  for (const production of [false, true]) {
    const options = authCookieOptions(production);
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, 'lax');
    assert.equal(options.secure, production);
    assert.equal(options.path, '/');
  }
});

test('Cookie parsing rejects missing, malformed, and ambiguous authentication cookies', () => {
  assert.equal(readAuthCookie(`other=value; ${AUTH_COOKIE}=encoded%2Etoken`), 'encoded.token');
  assert.equal(readAuthCookie(undefined), undefined);
  assert.equal(readAuthCookie(`${AUTH_COOKIE}=`), undefined);
  assert.equal(readAuthCookie(`${AUTH_COOKIE}=%`), undefined);
  assert.equal(readAuthCookie(`${AUTH_COOKIE}=one; ${AUTH_COOKIE}=two`), undefined);
});

function environment(overrides = {}) {
  return {
    DATABASE_URL: 'postgresql://localhost/retailsense',
    JWT_SECRET: randomBytes(32).toString('hex'),
    ...overrides,
  };
}

test('Authentication environment defaults to eight hours and the local frontend origin', () => {
  const configuration = validateEnvironment(environment());
  assert.equal(configuration.JWT_EXPIRES_SECONDS, 8 * 60 * 60);
  assert.equal(configuration.FRONTEND_ORIGIN, 'http://localhost:3000');
});

test('Authentication environment rejects weak secrets and invalid token lifetimes', () => {
  for (const secret of ['', 'short', ' '.repeat(40)]) {
    assert.throws(() => validateEnvironment(environment({ JWT_SECRET: secret })), /JWT_SECRET/);
  }
  for (const duration of ['0s', '25h', '8', '-1h', 'forever']) {
    assert.throws(() => validateEnvironment(environment({ JWT_EXPIRES_IN: duration })), /JWT_EXPIRES_IN/);
  }
  assert.equal(validateEnvironment(environment({ JWT_EXPIRES_IN: '24h' })).JWT_EXPIRES_SECONDS, 86400);
});

test('CORS configuration accepts only an HTTP origin, without credentials or paths', () => {
  for (const origin of ['*', 'file:///tmp', 'https://example.com/path', 'https://user@example.com', 'https://example.com?query=1']) {
    assert.throws(() => validateEnvironment(environment({ FRONTEND_ORIGIN: origin })), /FRONTEND_ORIGIN/);
  }
});

test('Initial admin configuration validates required fields and bcrypt byte limits', () => {
  const valid = {
    INITIAL_ADMIN_USERNAME: 'test-admin',
    INITIAL_ADMIN_EMAIL: 'test-admin@example.test',
    INITIAL_ADMIN_PASSWORD: randomBytes(18).toString('hex'),
    INITIAL_ADMIN_FULL_NAME: 'Test Administrator',
  };
  assert.equal(loadInitialAdmin(valid).username, 'test-admin');
  for (const key of Object.keys(valid)) {
    assert.throws(() => loadInitialAdmin({ ...valid, [key]: '' }), new RegExp(key));
  }
  assert.throws(() => loadInitialAdmin({ ...valid, INITIAL_ADMIN_PASSWORD: 'a'.repeat(73) }), /INITIAL_ADMIN_PASSWORD/);
  assert.throws(() => loadInitialAdmin({ ...valid, INITIAL_ADMIN_PASSWORD: 'é'.repeat(37) }), /INITIAL_ADMIN_PASSWORD/);
});

test('Integration database safety rejects application databases and misleading URL variants', () => {
  const application = 'postgresql://localhost/retailsense';
  assert.throws(() => validateTestDatabase(application, undefined), /TEST_DATABASE_URL/);
  assert.throws(() => validateTestDatabase(application, application), /TEST_DATABASE_URL/);
  assert.throws(() => validateTestDatabase(application, 'postgresql://localhost/retailsense?schema=tests'), /TEST_DATABASE_URL/);
  assert.throws(() => validateTestDatabase('postgresql://localhost/shared_test', 'postgresql://127.0.0.1/shared_test?schema=tests'), /TEST_DATABASE_URL/);
  assert.throws(() => validateTestDatabase(application, 'https://localhost/retailsense_test'), /TEST_DATABASE_URL/);
  assert.equal(validateTestDatabase(application, 'postgresql://localhost/retailsense_test'), 'postgresql://localhost/retailsense_test');
});
