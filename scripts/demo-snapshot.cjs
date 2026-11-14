const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { root, backend, backendRequire, environment, connect, quote } = require('./database-runtime.cjs');

// Explicit columns: new schema fields cannot silently enter a public snapshot.
// Order also respects foreign keys, including recommendation -> purchase -> lot.
const columns = Object.fromEntries(Object.entries({
  locations: 'id code name location_type address district city external_source external_id external_city_id is_active created_at updated_at deleted_at',
  categories: 'id parent_id code name external_source external_id is_active created_at',
  units: 'id code name symbol allow_fraction',
  products: 'id sku barcode name image_key image_path default_selling_price default_min_stock_level default_safety_stock is_global_all_stores category_id base_unit_id purchase_unit_id purchase_to_base_ratio default_cost track_expiry shelf_life_days external_source external_id is_active created_at updated_at deleted_at',
  store_products: 'id location_id product_id selling_price safety_stock min_stock_level is_active updated_at',
  import_jobs: 'id import_type file_name file_hash status total_rows success_rows failed_rows error_report created_by created_at completed_at dismissed_at',
  forecast_runs: 'id model_version algorithm horizon_months metrics daily_predictions status requested_by started_at completed_at',
  demand_forecasts: 'id forecast_run_id location_id product_id period_start period_end predicted_quantity estimated_unit_price predicted_revenue actual_quantity actual_revenue forecast_error created_at',
  replenishment_recommendations: 'id demand_forecast_id location_id product_id current_stock_snapshot incoming_stock_snapshot safety_stock_snapshot recommended_quantity demand_quantity_snapshot demand_period_start demand_period_end manager_quantity decision_status decided_by decided_at decision_note',
  purchase_orders: 'id order_number import_job_id replenishment_recommendation_id location_id status ordered_at received_at total_cost note created_by created_at updated_at',
  purchase_order_items: 'id purchase_order_id product_id purchase_quantity base_quantity unit_cost lot_number expiry_date line_total',
  inventory_lots: 'id location_id product_id lot_number quantity_on_hand unit_cost received_date expiry_date purchase_order_item_id created_at updated_at',
  sales: 'id invoice_number client_request_id request_hash import_job_id location_id sold_at subtotal discount_amount total_amount status created_by created_at',
  sale_items: 'id sale_id product_id quantity unit_price discount_amount line_total cost_of_goods_sold promotion_flag',
  expenses: 'id location_id expense_type amount expense_date description created_by created_at updated_at',
  sales_history_coverage: 'id location_id product_id period_start period_end source note confirmed_by created_at',
  inventory_alerts: 'id location_id product_id demand_forecast_id inventory_lot_id alert_type severity message status detected_at resolved_at',
}).map(([table, names]) => [table, names.split(' ')]));
const excluded = ['ai_datasets', 'ai_dataset_files', 'ai_training_jobs', 'ai_deployments',
  'ai_chat_sessions', 'ai_chat_messages', 'ai_audit_events'];
const userReferences = ['created_by', 'requested_by', 'decided_by', 'confirmed_by'];
const jsonColumns = new Set(['metrics', 'daily_predictions', 'error_report']);
const snapshotFile = path.join(root, 'datasets/demo/snapshot.json');
const manifestFile = path.join(root, 'datasets/demo/manifest.json');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const textHash = (filename) => sha(fs.readFileSync(filename, 'utf8').replaceAll('\r\n', '\n'));
const canonical = (value) => JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
  ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
const readRows = async (db, table) => (await db.query(`SELECT ${columns[table].map(quote).join(',')} FROM ${quote(table)} ORDER BY id`)).rows;
const pick = (object, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(object ?? {}, key)).map((key) => [key, object[key]]));

function sanitize(data, accounts) {
  const copy = structuredClone(data);
  const users = [], userIds = new Map();
  for (const account of accounts) {
    if (account.role_code === 'ADMIN') { userIds.set(account.id, '@admin'); continue; }
    assert.ok(['STORE_MANAGER', 'STAFF'].includes(account.role_code), 'Unknown role; review before publishing.');
    const number = users.length + 1;
    const id = `d5202611-1400-4000-8000-${String(number).padStart(12, '0')}`;
    userIds.set(account.id, id);
    users.push({ id, role_code: account.role_code, location_id: account.location_id,
      username: `demo_${account.role_code === 'STAFF' ? 'staff' : 'manager'}_${number}`,
      email: `demo-${number}@example.invalid`, full_name: `Demo ${account.role_code} ${number}`,
      is_active: account.is_active, created_at: account.created_at, updated_at: account.updated_at, deleted_at: account.deleted_at });
  }
  for (const rows of Object.values(copy)) for (const row of rows) {
    for (const key of userReferences) if (row[key] != null) {
      assert.ok(userIds.has(row[key]), 'Unresolved account reference.');
      row[key] = userIds.get(row[key]);
    }
  }
  copy.locations.forEach((r, i) => {
    const demo = r.external_source === 'RETAILSENSE_SYNTHETIC_V1' && /^FC-ST0[1-3]$/.test(r.code);
    const names = { 'FC-ST01': 'Cửa hàng Bến Sông', 'FC-ST02': 'Cửa hàng Vườn Xanh', 'FC-ST03': 'Cửa hàng Trung Tâm' };
    r.name = demo ? names[r.code] : `Cửa hàng Demo ${i + 1}`;
    if (!demo) { r.code = `DEMO-ST${String(i + 1).padStart(2, '0')}`; r.external_source = null; r.external_id = null; }
    r.address = null; r.district = null; r.city = null; r.external_city_id = null;
  });
  copy.categories.forEach((r, i) => {
    r.name = r.code === 'FC-GOODS' ? 'Hàng tiêu dùng' : `Danh mục Demo ${i + 1}`;
    r.external_id = null;
    r.external_source = r.code === 'FC-GOODS' ? 'RETAILSENSE_SYNTHETIC_V1' : null;
    if (r.code !== 'FC-GOODS') { r.code = `DEMO-CAT${i + 1}`; r.external_source = null; r.external_id = null; }
  });
  const units = { 'FC-CAN': ['Lon', 'lon'], 'FC-PCS': ['Cái', 'cái'], 'FC-KG': ['Kilôgam', 'kg'] };
  copy.units.forEach((r) => {
    assert.ok(units[r.code], 'Unknown unit; explicitly review its public label before exporting.');
    [r.name, r.symbol] = units[r.code];
  });
  const { forecastDemoProducts, forecastDemoImagePaths } = require('../backend/dist/prisma/forecast-demo.js');
  copy.products.forEach((r) => {
    const index = Number(r.external_id) - 1;
    assert.ok(r.external_source === 'RETAILSENSE_SYNTHETIC_V1' && r.sku === `FC-${String(index + 1).padStart(2, '0')}` && forecastDemoProducts[index],
      'Unknown product; review its public name and photo before exporting.');
    r.name = forecastDemoProducts[index][0]; r.barcode = null; r.image_path = forecastDemoImagePaths[index];
    // image_key is a small application-defined enum, never free text.
    assert.ok(r.image_key == null || ['vegetables','fruit','meat','seafood','milk','drinks','rice','noodles','canned','eggs','bakery','household'].includes(r.image_key));
  });
  const names = (rows) => new Map(rows.map((row) => [row.id, row.name]));
  const stores = names(copy.locations), products = names(copy.products);
  copy.import_jobs.forEach((r, i) => {
    r.file_name = `DEMO_${r.import_type}_${i + 1}.seed`; r.file_hash = sha(`public-demo-import-${i + 1}`); r.error_report = null;
  });
  copy.forecast_runs.forEach((r) => {
    assert.ok(['freshretail-demand-v1-lightgbm', 'm5-quantity-v1', 'm5-quantity-v2'].includes(r.model_version), 'Review the forecast model before exporting.');
    assert.ok(['LightGBM', 'RollingMean28', 'SeasonalNaive'].includes(r.algorithm));
    if (r.metrics) {
      const original = r.metrics;
      r.metrics = pick(original, ['origin','errorCode','usageMode','locationId','horizonDays','modelTargetSpace',
        'realWorldAccuracyVerified','negativePredictionsClipped','dataSource','periodKind','calendarPeriods','operationalWindowDays']);
      r.metrics.skipped = (original.skipped ?? []).map((s) => ({ ...pick(s, ['locationId','productId','reason']),
        store: stores.get(s.locationId) ?? 'Demo', product: products.get(s.productId) ?? 'Demo' }));
      assert.match(r.metrics.origin, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(['STORE_HISTORY', 'SYNTHETIC_DEMO'].includes(r.metrics.usageMode));
      if (r.metrics.modelTargetSpace && !['base_unit_quantity', 'log_sales', 'normalized_sale_amount'].includes(r.metrics.modelTargetSpace)) delete r.metrics.modelTargetSpace;
      assert.ok(r.metrics.locationId == null || stores.has(r.metrics.locationId));
      for (const key of ['horizonDays','operationalWindowDays','negativePredictionsClipped']) {
        if (r.metrics[key] != null) assert.ok(typeof r.metrics[key] === 'number' && Number.isFinite(r.metrics[key]));
      }
      assert.ok(r.metrics.errorCode == null || ['PREDICTION_FAILED','MODEL_UNAVAILABLE','INSUFFICIENT_HISTORY','INVALID_FORECAST_INPUT'].includes(r.metrics.errorCode));
      if (r.metrics.dataSource) assert.ok(['SYNTHETIC','REAL','MIXED','UNKNOWN'].includes(r.metrics.dataSource));
      if (r.metrics.periodKind) assert.ok(['CALENDAR_MONTH','LEGACY_ROLLING_DAYS'].includes(r.metrics.periodKind));
      if (r.metrics.calendarPeriods) for (const period of r.metrics.calendarPeriods) {
        assert.deepEqual(Object.keys(period).sort(), ['end','start']);
        assert.match(period.start, /^\d{4}-\d{2}-\d{2}$/); assert.match(period.end, /^\d{4}-\d{2}-\d{2}$/);
      }
      for (const skipped of r.metrics.skipped) {
        assert.ok(stores.has(skipped.locationId) && products.has(skipped.productId));
        assert.ok(['INSUFFICIENT_HISTORY','INVALID_FORECAST_INPUT','UNCONFIRMED_COVERAGE','MISSING_PRICE','NO_COVERAGE','NO_HISTORY'].includes(skipped.reason), 'Review forecast skip reason before publishing.');
      }
      // Model metadata includes free text and source paths; the bundled model supplies its own metadata.
    }
    if (r.daily_predictions) r.daily_predictions = r.daily_predictions.map((s) => ({
      ...pick(s, ['locationId','productId','dataSource']),
      daily: (s.daily ?? []).map((d) => pick(d, ['date','quantity'])),
      history: (s.history ?? []).map((d) => pick(d, ['date','quantity'])),
    }));
  });
  copy.replenishment_recommendations.forEach((r) => { r.decision_note = r.decision_note == null ? null : 'Quyết định trong dữ liệu demo.'; });
  copy.purchase_orders.forEach((r, i) => { r.order_number = `DEMO-PO-${String(i + 1).padStart(4, '0')}`; r.note = null; });
  // Preserve equality of lot labels without publishing the original free text.
  const lots = new Map();
  for (const r of [...copy.purchase_order_items, ...copy.inventory_lots]) if (r.lot_number != null) {
    const key = r.lot_number;
    if (!lots.has(key)) lots.set(key, `DEMO-LOT-${lots.size + 1}`);
    r.lot_number = lots.get(key);
  }
  copy.sales.forEach((r, i) => { r.invoice_number = `DEMO-SALE-${String(i + 1).padStart(5, '0')}`; r.client_request_id = null; r.request_hash = null; });
  copy.expenses.forEach((r) => { r.description = null; });
  copy.sales_history_coverage.forEach((r) => { r.note = 'Lịch sử giả lập đã ẩn danh để khôi phục demo.'; });
  copy.inventory_alerts.forEach((r) => { r.message = 'Cảnh báo tồn kho từ dữ liệu demo.'; });
  return { version: 1, accounts: users, tables: copy };
}

function migrations() {
  const directory = path.join(backend, 'prisma/migrations');
  return fs.readdirSync(directory).filter((name) => fs.existsSync(path.join(directory, name, 'migration.sql')))
    .sort().map((name) => ({ name, sha256: textHash(path.join(directory, name, 'migration.sql')) }));
}
function validate(snapshot) {
  assert.equal(snapshot.version, 1, 'Unsupported snapshot version.');
  assert.deepEqual(Object.keys(snapshot.tables).sort(), Object.keys(columns).sort(), 'Unexpected snapshot table.');
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    assert.ok(Array.isArray(rows));
    const ids = new Set();
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), [...columns[table]].sort(), `Unexpected columns in ${table}.`);
      assert.ok(!ids.has(row.id), `Duplicate ID in ${table}.`); ids.add(row.id);
    }
  }
  for (const account of snapshot.accounts) {
    assert.deepEqual(Object.keys(account).sort(), ['id','role_code','location_id','username','email','full_name','is_active','created_at','updated_at','deleted_at'].sort());
    assert.ok(['STORE_MANAGER', 'STAFF'].includes(account.role_code));
    assert.match(account.username, /^demo_(manager|staff)_\d+$/);
    assert.match(account.email, /^demo-\d+@example\.invalid$/);
  }
  const serialized = JSON.stringify(snapshot);
  assert.ok(!/password|reset_token|Bearer |-----BEGIN|postgres(?:ql)?:\/\//i.test(serialized), 'Sensitive content detected in snapshot.');
  return snapshot;
}
function load() {
  const bytes = fs.readFileSync(snapshotFile), manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.equal(sha(bytes), manifest.sha256, 'Snapshot checksum mismatch.');
  assert.equal(textHash(path.join(backend, 'prisma/schema.prisma')), manifest.schemaSha256, 'Schema changed; review and regenerate the snapshot package.');
  assert.deepEqual(migrations(), manifest.migrations, 'Migration package differs from this snapshot.');
  for (const asset of manifest.assets) {
    assert.ok(/^frontend\/public\/assets\/[a-zA-Z0-9_./-]+$/.test(asset.path) && !asset.path.includes('..'));
    assert.equal(sha(fs.readFileSync(path.join(root, asset.path))), asset.sha256, `Missing or changed asset: ${asset.path}`);
  }
  const snapshot = validate(JSON.parse(bytes));
  assert.deepEqual(Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length])), manifest.counts);
  return snapshot;
}

async function exportSnapshot() {
  if (!process.argv.includes('--confirmed-synthetic')) throw new Error('Export requires --confirmed-synthetic after the owner confirms all numerical data is demo data.');
  const db = connect(); await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const data = {};
    for (const table of Object.keys(columns)) data[table] = await readRows(db, table);
    const accounts = (await db.query('SELECT u.id,u.location_id,u.is_active,u.created_at,u.updated_at,u.deleted_at,r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.id')).rows;
    const snapshot = validate(sanitize(data, accounts));
    const omitted = {};
    for (const table of excluded) omitted[table] = Number((await db.query(`SELECT COUNT(*) FROM ${quote(table)}`)).rows[0].count);
    await db.query('ROLLBACK');
    const bytes = JSON.stringify(snapshot, null, 2) + '\n';
    const assets = fs.readdirSync(path.join(root, 'frontend/public/assets'), { recursive: true })
      .map((name) => `frontend/public/assets/${name.replaceAll('\\', '/')}`)
      .filter((name) => fs.statSync(path.join(root, name)).isFile()).sort()
      .map((name) => ({ path: name, sha256: sha(fs.readFileSync(path.join(root, name))) }));
    const manifest = { version: 1, createdAt: new Date().toISOString(), sha256: sha(bytes),
      schemaSha256: textHash(path.join(backend, 'prisma/schema.prisma')), migrations: migrations(),
      counts: Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length])),
      anonymizedAccounts: snapshot.accounts.length, excludedPrivateTables: omitted, assets };
    fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
    fs.writeFileSync(snapshotFile, bytes); fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({ exported: manifest.counts, accounts: snapshot.accounts.length, assets: assets.length, sha256: manifest.sha256 }, null, 2));
  } finally { await db.end(); }
}

async function emptyTarget(db) {
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map((r) => r.tablename);
  for (const table of tables.filter((name) => !['_prisma_migrations','roles','users'].includes(name))) {
    if (Number((await db.query(`SELECT COUNT(*) FROM ${quote(table)}`)).rows[0].count))
      throw new Error(`Target contains ${table} data. Restore refused; use a new database. No records were changed.`);
  }
  if (tables.includes('users')) {
    const accounts = (await db.query('SELECT r.code,u.is_active,u.deleted_at FROM users u JOIN roles r ON r.id=u.role_id')).rows;
    if (accounts.length > 1 || accounts.some((u) => u.code !== 'ADMIN' || !u.is_active || u.deleted_at))
      throw new Error('Restore requires an empty database or one active bootstrap ADMIN only. Existing users were preserved.');
  }
}
async function insertRows(db, table, rows, names) {
  for (let start = 0; start < rows.length; start += 200) {
    const values = [];
    const placeholders = rows.slice(start, start + 200).map((row) => '(' + names.map((key) => {
      const value = row[key]; values.push(jsonColumns.has(key) && value != null ? JSON.stringify(value) : value);
      return `$${values.length}`;
    }).join(',') + ')').join(',');
    await db.query(`INSERT INTO ${quote(table)} (${names.map(quote).join(',')}) VALUES ${placeholders}`, values);
  }
}
function remap(row, adminId) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === '@admin' ? adminId : value]));
}
async function verify(db, snapshot, adminId) {
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    const actual = await readRows(db, table);
    const expected = rows.map((row) => remap(row, adminId)).sort((a, b) => a.id.localeCompare(b.id));
    assert.equal(canonical(actual), canonical(expected), `Restored rows differ: ${table}`);
  }
}
async function restoreSnapshot() {
  const snapshot = load(), config = environment();
  let db = connect(config); await db.connect();
  try { await emptyTarget(db); } finally { await db.end(); }
  const migration = spawnSync(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: backend, env: config, stdio: 'inherit', windowsHide: true });
  if (migration.error || migration.status !== 0) throw new Error('Migration failed. Demo rows were not imported.');
  db = connect(config); await db.connect();
  let committed = false;
  try {
    // Do not seed or reset an existing account. Fresh installs use local INITIAL_ADMIN_* only.
    if (!Number((await db.query('SELECT COUNT(*) FROM users')).rows[0].count)) {
      const { PrismaPg } = backendRequire('@prisma/adapter-pg');
      const { PrismaClient } = require('../backend/dist/generated/prisma/client');
      const { seedAuthentication, loadInitialAdmin } = require('../backend/dist/prisma/seed');
      const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL, options: '-c timezone=UTC' }) });
      try { await seedAuthentication(prisma, loadInitialAdmin(config)); } finally { await prisma.$disconnect(); }
    }
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    // Block concurrent writes during the final emptiness check and entire import.
    await db.query(`LOCK TABLE ${[...Object.keys(columns), ...excluded, 'users'].map(quote).join(',')} IN EXCLUSIVE MODE`);
    await emptyTarget(db);
    const admin = (await db.query("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='ADMIN' AND u.is_active AND u.deleted_at IS NULL")).rows[0];
    assert.ok(admin, 'An active bootstrap administrator is required.');
    const roles = new Map((await db.query('SELECT id,code FROM roles')).rows.map((r) => [r.code, r.id]));
    const credentials = [];
    await insertRows(db, 'locations', snapshot.tables.locations, columns.locations);
    for (const account of snapshot.accounts) {
      const password = randomBytes(24).toString('base64url');
      const { role_code, ...user } = account;
      const row = { ...user, role_id: roles.get(role_code), password_hash: await backendRequire('bcrypt').hash(password, 12) };
      await insertRows(db, 'users', [row], Object.keys(row));
      credentials.push({ username: account.username, password, role: role_code });
    }
    for (const [table, rows] of Object.entries(snapshot.tables)) {
      if (table === 'locations') continue;
      // This snapshot's category tree fits in one statement, with FK checks at statement end.
      if (table === 'categories' && rows.length > 200) throw new Error('Review category ordering before restoring a larger catalog.');
      await insertRows(db, table, rows.map((row) => remap(row, admin.id)), columns[table]);
    }
    await verify(db, snapshot, admin.id);
    for (const table of excluded) assert.equal(Number((await db.query(`SELECT COUNT(*) FROM ${quote(table)}`)).rows[0].count), 0);
    const directory = path.join(root, '.local'); fs.mkdirSync(directory, { recursive: true });
    const credentialFile = path.join(directory, `demo-accounts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    // Prepare the private credential file before commit; no password is printed or published.
    fs.writeFileSync(credentialFile, JSON.stringify({ note: 'Only valid after a successful demo restore.', accounts: credentials }, null, 2), { flag: 'wx', mode: 0o600 });
    await db.query('COMMIT'); committed = true;
    console.log(`Demo restored and all ${Object.keys(columns).length} business tables verified. Existing ADMIN credentials preserved.`);
    console.log(`New, private demo account passwords: ${credentialFile}`);
  } catch (error) { if (!committed) await db.query('ROLLBACK').catch(() => {}); throw error; }
  finally { await db.end(); }
}

async function main() {
  switch (process.argv[2]) {
    case 'export': return exportSnapshot();
    case 'restore': return restoreSnapshot();
    case 'check': load(); console.log('Snapshot, schema, migrations and asset checksums verified.'); return;
    default: throw new Error('Use export --confirmed-synthetic, restore, or check.');
  }
}
if (require.main === module) main().catch((error) => {
  // Database errors can embed row values; never log connection strings or row payloads.
  console.error(error.code ? `Database operation failed (${error.code}); no partial demo transaction was committed.` : error.message);
  process.exitCode = 1;
});
module.exports = { columns, excluded, sanitize, validate, load, emptyTarget, restoreSnapshot, verify, canonical };
