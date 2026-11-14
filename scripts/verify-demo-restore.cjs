// Run only against a newly created, dedicated *_test database.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { root, backendRequire, environment, connect, quote } = require('./database-runtime.cjs');
const { columns, load, restoreSnapshot, verify } = require('./demo-snapshot.cjs');

async function fingerprint(db) {
  const hash = createHash('sha256');
  for (const table of [...Object.keys(columns), 'users', 'roles']) {
    const { rows } = await db.query(`SELECT row_to_json(t)::text AS value FROM (SELECT * FROM ${quote(table)} ORDER BY id) t`);
    hash.update(table); for (const row of rows) hash.update(row.value);
  }
  return hash.digest('hex');
}
async function main() {
  const config = environment(), source = new URL(config.DATABASE_URL);
  const target = new URL(config.RESTORE_VERIFY_DATABASE_URL || '');
  assert.ok(target.pathname.endsWith('_test') && target.pathname !== source.pathname,
    'RESTORE_VERIFY_DATABASE_URL must select a separate, freshly created *_test database.');
  const original = connect(config); await original.connect();
  let restored, app;
  try {
    const before = await fingerprint(original);
    const password = randomBytes(24).toString('base64url');
    Object.assign(process.env, {
      DATABASE_URL: target.toString(), NODE_ENV: 'test', INITIAL_ADMIN_USERNAME: 'restore_admin',
      INITIAL_ADMIN_EMAIL: 'restore-admin@example.invalid', INITIAL_ADMIN_FULL_NAME: 'Restore verification',
      INITIAL_ADMIN_PASSWORD: password, JWT_SECRET: randomBytes(48).toString('hex'),
      FRONTEND_ORIGIN: 'http://localhost:3000', DOTENV_CONFIG_QUIET: 'true',
      AI_STORAGE_ROOT: path.join(root, '.test-artifacts/restore-ai'),
    });
    await restoreSnapshot();
    restored = connect(); await restored.connect();
    const snapshot = load();
    const admin = (await restored.query("SELECT id,password_hash FROM users WHERE username='restore_admin'")).rows[0];
    await verify(restored, snapshot, admin.id);
    assert.equal(Number((await restored.query('SELECT COUNT(*) FROM users')).rows[0].count), snapshot.accounts.length + 1);
    const afterFirst = await fingerprint(restored);
    await assert.rejects(restoreSnapshot(), /Restore refused/);
    assert.equal(await fingerprint(restored), afterFirst, 'A repeated restore must leave the target untouched.');
    assert.equal((await restored.query('SELECT COUNT(*)::int AS count FROM sales_history_coverage c LEFT JOIN locations l ON l.id=c.location_id LEFT JOIN products p ON p.id=c.product_id WHERE l.id IS NULL OR p.id IS NULL')).rows[0].count, 0);
    backendRequire('reflect-metadata');
    const { NestFactory } = backendRequire('@nestjs/core');
    const { AppModule } = require('../backend/dist/src/app.module');
    const { configureApp } = require('../backend/dist/src/config/configure-app');
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    configureApp(app); await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: {
      'Content-Type': 'application/json', Origin: 'http://localhost:3000',
    }, body: JSON.stringify({ identifier: 'restore_admin', password }) });
    assert.equal(login.status, 200, 'Restored administrator can sign in.');
    const cookie = login.headers.get('set-cookie').split(';')[0];
    for (const endpoint of ['/health','/products?available=true','/locations','/inventory','/purchases',
      '/sales','/forecasts/runs','/replenishment','/alerts']) {
      const response = await fetch(base + endpoint, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200, `Restored API: ${endpoint}`);
      await response.json();
    }
    const orders = snapshot.tables.purchase_orders.filter((p) => p.replenishment_recommendation_id);
    for (const order of orders) assert.equal((await fetch(`${base}/purchases/${order.id}`, { headers: { Cookie: cookie } })).status, 200);
    assert.equal(await fingerprint(original), before, 'The original application database must remain unchanged.');
    console.log('PASS: exact business rows, foreign keys, fresh account credentials, repeated-restore refusal, API login/read flows and unchanged source database.');
    console.log(`Verification database retained for inspection: ${target.pathname.slice(1)}`);
  } finally {
    if (app) await app.close();
    if (restored) await restored.end();
    await original.end();
  }
}
if (require.main === module) main().catch((error) => {
  console.error(error.code ? `Restore verification failed (${error.code}).` : error.message);
  process.exitCode = 1;
});
