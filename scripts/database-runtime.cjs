const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const backendRequire = createRequire(path.join(backend, 'package.json'));
const { Client, types } = backendRequire('pg');
// Preserve PostgreSQL dates, microseconds and NUMERIC strings during export/import.
for (const oid of [1082, 1114, 1184]) types.setTypeParser(oid, (value) => value);

function environment() {
  const file = path.join(backend, '.env');
  return { ...(fs.existsSync(file) ? backendRequire('dotenv').parse(fs.readFileSync(file)) : {}), ...process.env };
}
function connect(configuration = environment()) {
  if (!configuration.DATABASE_URL) throw new Error('Configure DATABASE_URL in backend/.env first.');
  return new Client({ connectionString: configuration.DATABASE_URL, connectionTimeoutMillis: 10000,
    options: '-c timezone=UTC', application_name: 'retailsense-demo-transfer' });
}
const quote = (identifier) => '"' + identifier.replaceAll('"', '""') + '"';
module.exports = { root, backend, backendRequire, environment, connect, quote };
