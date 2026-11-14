const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, sanitize, validate, emptyTarget } = require('../../scripts/demo-snapshot.cjs');

test('public demo package has valid checksums, all assets and no authentication fields', () => {
  const data = load();
  assert.equal(data.tables.products.length, 20);
  assert.equal(data.tables.locations.length, 4);
  assert.equal(data.accounts.length, 3);
  assert.ok(data.tables.products.every((p) => p.image_path.startsWith('/assets/products/')));
  assert.ok(!JSON.stringify(data).includes('password_hash'));
  assert.ok(!Object.keys(data.tables).some((name) => name.startsWith('ai_')));
});

test('sanitizer removes account identifiers and free text while preserving stock and foreign keys', () => {
  const data = load();
  const original = structuredClone(data.tables);
  const rawId = 'd5202699-0000-4000-8000-000000000001';
  for (const rows of Object.values(original)) for (const row of rows) {
    for (const key of ['created_by','requested_by','decided_by','confirmed_by']) {
      if (row[key] != null) row[key] = rawId;
    }
  }
  original.locations[0].address = 'private.person@example.org';
  original.locations[0].name = 'Private customer name';
  original.purchase_orders[0].note = 'Bearer private-token';
  original.import_jobs[0].error_report = { password: 'private-password' };
  const result = sanitize(original, [{ id: rawId, role_code: 'ADMIN' }]);
  const serialized = JSON.stringify(result);
  for (const secret of [rawId, 'private.person@example.org', 'Private customer name', 'private-token', 'private-password']) assert.ok(!serialized.includes(secret));
  assert.deepEqual(result.tables.inventory_lots.map((r) => [r.quantity_on_hand,r.unit_cost,r.purchase_order_item_id]),
    original.inventory_lots.map((r) => [r.quantity_on_hand,r.unit_cost,r.purchase_order_item_id]));
  validate(result);
});

test('unreviewed snapshot columns are rejected before database work', () => {
  const data = load(); data.tables.products[0].private_note = 'unreviewed';
  assert.throws(() => validate(data), /Unexpected columns/);
});

test('restore refuses populated databases and performs no write query', async () => {
  const queries = [];
  const db = { query: async (sql) => {
    queries.push(sql);
    if (sql.includes('pg_tables')) return { rows: [{ tablename: 'products' }] };
    return { rows: [{ count: '20' }] };
  } };
  await assert.rejects(emptyTarget(db), /Restore refused/);
  assert.ok(queries.every((sql) => sql.startsWith('SELECT')));
});
