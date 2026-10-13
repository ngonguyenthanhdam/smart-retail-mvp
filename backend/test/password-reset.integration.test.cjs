require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { prepareTestEnvironment } = require('./test-database.cjs');

prepareTestEnvironment();

const { NestFactory } = require('@nestjs/core');
const bcrypt = require('bcrypt');
const { AppModule } = require('../dist/src/app.module.js');
const { configureApp } = require('../dist/src/config/configure-app.js');
const { PrismaService } = require('../dist/src/database/prisma.service.js');
const { ResetMailer } = require('../dist/src/auth/reset-mailer.service.js');
const { AUTH_COOKIE } = require('../dist/src/auth/auth-cookie.js');

test('Password recovery API with a mocked mail transport', { timeout: 90_000 }, async (t) => {
  const namespace = `reset_${randomUUID().slice(0, 8)}`;
  const originalPassword = randomBytes(24).toString('hex');
  const genericResponse = {
    message: 'If an account with that email exists, a password reset link has been sent.',
  };
  const userIds = [];
  const messages = [];
  let app;
  let prisma;

  t.after(async () => {
    try {
      if (prisma) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      if (app) await app.close();
    }
  });

  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  configureApp(app);
  const mailer = app.get(ResetMailer);
  const captureMail = async (email, resetUrl) => { messages.push({ email, resetUrl }); };
  mailer.sendPasswordReset = captureMail;
  await app.listen(0, '127.0.0.1');
  prisma = app.get(PrismaService);
  const baseUrl = await app.getUrl();
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  const originalHash = await bcrypt.hash(originalPassword, 12);

  async function createUser(suffix, overrides = {}) {
    const user = await prisma.user.create({
      data: {
        username: `${namespace}_${suffix}`, email: `${namespace}_${suffix}@example.test`,
        fullName: `Password Recovery Test ${suffix}`, roleId: adminRole.id,
        passwordHash: originalHash, createdAt: new Date(), updatedAt: new Date(),
        ...overrides,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function post(path, body, cookie) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Origin: process.env.FRONTEND_ORIGIN,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
      redirect: 'manual',
    });
  }

  async function requestToken(user) {
    const before = messages.length;
    const response = await post('/auth/forgot-password', { email: user.email });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), genericResponse);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(messages.length, before + 1);
    const message = messages.at(-1);
    assert.equal(message.email, user.email);
    const link = new URL(message.resetUrl);
    assert.equal(link.origin, process.env.FRONTEND_ORIGIN);
    assert.equal(link.pathname, '/reset-password');
    assert.equal(link.search, '');
    const token = new URLSearchParams(link.hash.slice(1)).get('token');
    assert.match(token, /^[a-f0-9]{64}$/);
    return token;
  }

  async function reset(token, newPassword = randomBytes(24).toString('hex'), cookie) {
    return post('/auth/reset-password', { token, newPassword }, cookie);
  }

  async function currentUser(user) {
    return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  }

  async function assertPasswordUnchanged(user) {
    const saved = await currentUser(user);
    assert.equal(saved.passwordHash === originalHash, true);
  }

  await t.test('A known active account receives a random token while only its hash and 30-minute expiry are stored', async () => {
    const user = await createUser('known');
    const startedAt = Date.now();
    const token = await requestToken(user);
    const completedAt = Date.now();
    const saved = await currentUser(user);
    const expectedHash = createHash('sha256').update(token).digest('hex');
    assert.equal(saved.passwordResetTokenHash === expectedHash, true);
    assert.notEqual(saved.passwordResetTokenHash, token);
    const expiresAt = saved.passwordResetExpiresAt.getTime();
    assert.ok(expiresAt >= startedAt + 30 * 60_000);
    assert.ok(expiresAt <= completedAt + 30 * 60_000);
    await assertPasswordUnchanged(user);
  });

  await t.test('Unknown email returns the same generic response and does not send mail', async () => {
    const before = messages.length;
    const response = await post('/auth/forgot-password', { email: `${namespace}_unknown@example.test` });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), genericResponse);
    assert.equal(messages.length, before);
  });

  for (const [name, overrides] of [
    ['inactive', { isActive: false }],
    ['deleted', { deletedAt: new Date() }],
  ]) {
    await t.test(`An ${name} account receives the generic response without a reset token or email`, async () => {
      const user = await createUser(name, overrides);
      const before = messages.length;
      const response = await post('/auth/forgot-password', { email: user.email });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), genericResponse);
      assert.equal(messages.length, before);
      const saved = await currentUser(user);
      assert.equal(saved.passwordResetTokenHash, null);
      assert.equal(saved.passwordResetExpiresAt, null);
    });
  }

  await t.test('A newer request invalidates the previous token', async () => {
    const user = await createUser('replaced');
    const firstToken = await requestToken(user);
    const secondToken = await requestToken(user);
    assert.notEqual(firstToken, secondToken);
    assert.equal((await reset(firstToken)).status, 400);
    const saved = await currentUser(user);
    assert.equal(saved.passwordResetTokenHash === createHash('sha256').update(secondToken).digest('hex'), true);
    assert.equal((await reset(secondToken)).status, 200);
  });

  await t.test('A valid token changes the bcrypt password, clears reset fields and expires the browser cookie', async () => {
    const user = await createUser('success');
    const token = await requestToken(user);
    const login = await post('/auth/login', { identifier: user.username, password: originalPassword });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const newPassword = randomBytes(24).toString('hex');
    const response = await reset(token, newPassword, cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(await response.json()), ['message']);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const clearedCookie = response.headers.get('set-cookie');
    assert.ok(clearedCookie?.startsWith(`${AUTH_COOKIE}=;`));
    assert.match(clearedCookie, /;\s*HttpOnly/i);
    const expires = /Expires=([^;]+)/i.exec(clearedCookie)?.[1];
    assert.ok(expires && new Date(expires).getTime() < Date.now());
    const saved = await currentUser(user);
    assert.equal(saved.passwordResetTokenHash, null);
    assert.equal(saved.passwordResetExpiresAt, null);
    assert.notEqual(saved.passwordHash, newPassword);
    assert.equal(bcrypt.getRounds(saved.passwordHash), 12);
    assert.equal(await bcrypt.compare(newPassword, saved.passwordHash), true);
    assert.equal(await bcrypt.compare(originalPassword, saved.passwordHash), false);
    const oldLogin = await post('/auth/login', { identifier: user.username, password: originalPassword });
    assert.equal(oldLogin.status, 401);
    const newLogin = await post('/auth/login', { identifier: user.email, password: newPassword });
    assert.equal(newLogin.status, 200);
    assert.equal((await newLogin.json()).id, user.id);
    assert.equal((await reset(token)).status, 400);
  });

  await t.test('Expired tokens fail without changing the password', async () => {
    const user = await createUser('expired');
    const token = await requestToken(user);
    await prisma.user.update({ where: { id: user.id }, data: { passwordResetExpiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await reset(token)).status, 400);
    await assertPasswordUnchanged(user);
  });

  await t.test('An unrelated random token fails without changing another account', async () => {
    const user = await createUser('invalid');
    await requestToken(user);
    assert.equal((await reset(randomBytes(32).toString('hex'))).status, 400);
    await assertPasswordUnchanged(user);
  });

  for (const [name, overrides] of [
    ['deactivated', { isActive: false }],
    ['soft_deleted', { deletedAt: new Date() }],
  ]) {
    await t.test(`A token cannot be used after its account is ${name}`, async () => {
      const user = await createUser(name);
      const token = await requestToken(user);
      await prisma.user.update({ where: { id: user.id }, data: overrides });
      assert.equal((await reset(token)).status, 400);
      await assertPasswordUnchanged(user);
    });
  }

  await t.test('Concurrent attempts can consume a reset token only once', async () => {
    const user = await createUser('concurrent');
    const token = await requestToken(user);
    const passwords = [randomBytes(24).toString('hex'), randomBytes(24).toString('hex')];
    const responses = await Promise.all(passwords.map((password) => reset(token, password)));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
    const saved = await currentUser(user);
    const winner = responses.findIndex((response) => response.status === 200);
    assert.equal(await bcrypt.compare(passwords[winner], saved.passwordHash), true);
    assert.equal(await bcrypt.compare(passwords[1 - winner], saved.passwordHash), false);
    assert.equal(saved.passwordResetTokenHash, null);
    assert.equal(saved.passwordResetExpiresAt, null);
  });

  await t.test('Mail delivery failure stays generic and removes the undelivered token', async () => {
    const user = await createUser('mail_failed');
    mailer.sendPasswordReset = async () => { throw new Error('Simulated SMTP failure'); };
    try {
      const response = await post('/auth/forgot-password', { email: user.email });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), genericResponse);
      const saved = await currentUser(user);
      assert.equal(saved.passwordResetTokenHash, null);
      assert.equal(saved.passwordResetExpiresAt, null);
      await assertPasswordUnchanged(user);
    } finally {
      mailer.sendPasswordReset = captureMail;
    }
  });

  await t.test('A delayed SMTP failure cannot erase a newer successfully sent token', async () => {
    const user = await createUser('mail_race');
    let announceFirstMail;
    let failFirstMail;
    let firstRequest;
    const firstMailStarted = new Promise((resolve) => { announceFirstMail = resolve; });
    const firstMailFailure = new Promise((resolve) => { failFirstMail = resolve; });
    let calls = 0;
    mailer.sendPasswordReset = async (email, resetUrl) => {
      calls += 1;
      if (calls === 1) {
        announceFirstMail();
        await firstMailFailure;
        throw new Error('Simulated delayed SMTP failure');
      }
      await captureMail(email, resetUrl);
    };
    try {
      firstRequest = post('/auth/forgot-password', { email: user.email });
      await Promise.race([
        firstMailStarted,
        firstRequest.then(() => { throw new Error('The first request did not attempt to send email.'); }),
      ]);
      const newerToken = await requestToken(user);
      failFirstMail();
      const failedDeliveryResponse = await firstRequest;
      assert.equal(failedDeliveryResponse.status, 200);
      assert.deepEqual(await failedDeliveryResponse.json(), genericResponse);
      const saved = await currentUser(user);
      assert.equal(saved.passwordResetTokenHash === createHash('sha256').update(newerToken).digest('hex'), true);
      assert.equal((await reset(newerToken)).status, 200);
    } finally {
      failFirstMail();
      if (firstRequest) await firstRequest;
      mailer.sendPasswordReset = captureMail;
    }
  });

  await t.test('Malformed email requests are rejected without sending mail', async () => {
    const before = messages.length;
    for (const body of [{}, null, [], { email: '' }, { email: 'not-an-email' }, { email: ['user@example.test'] }]) {
      assert.equal((await post('/auth/forgot-password', body)).status, 400);
    }
    assert.equal(messages.length, before);
  });

  await t.test('Malformed reset requests fail without consuming a valid token', async () => {
    const user = await createUser('malformed');
    const token = await requestToken(user);
    for (const body of [
      {}, null, [], { token }, { token, newPassword: [] },
      { token: [], newPassword: originalPassword },
      { token: 'invalid', newPassword: originalPassword },
      { token, newPassword: 'short' },
      { token, newPassword: '😀'.repeat(7) },
      { token, newPassword: 'é'.repeat(37) },
    ]) {
      assert.equal((await post('/auth/reset-password', body)).status, 400);
    }
    await assertPasswordUnchanged(user);
    assert.equal((await reset(token, '😀'.repeat(8))).status, 200);
  });

  await t.test('A 72-byte password is accepted without bcrypt truncation', async () => {
    const user = await createUser('byte_limit');
    const token = await requestToken(user);
    const password = 'é'.repeat(36);
    assert.equal((await reset(token, password)).status, 200);
    const login = await post('/auth/login', { identifier: user.username, password });
    assert.equal(login.status, 200);
  });
});
