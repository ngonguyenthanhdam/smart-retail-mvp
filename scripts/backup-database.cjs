// Private, complete backup. Never writes a raw database archive into a tracked directory.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, environment } = require('./database-runtime.cjs');

function main() {
  const config = environment();
  const url = new URL(config.DATABASE_URL);
  const directory = path.join(root, '.local', 'backups');
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(directory, `retailsense-${stamp}.dump`);
  const local = path.join(root, '.local/postgresql/pgsql/bin');
  const executable = (name) => fs.existsSync(path.join(local, `${name}.exe`))
    ? path.join(local, `${name}.exe`) : name;
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '10' };
  if (url.searchParams.has('sslmode')) env.PGSSLMODE = url.searchParams.get('sslmode');
  const dump = spawnSync(executable('pg_dump'), ['--no-password', '--format=custom', '--no-owner',
    '--no-privileges', '--file', target], { env, windowsHide: true, encoding: 'utf8' });
  if (dump.error || dump.status !== 0) throw new Error('pg_dump failed; check PostgreSQL access. Any partial archive remains private in .local/backups.');
  const check = spawnSync(executable('pg_restore'), ['--list', target], { windowsHide: true, encoding: 'utf8' });
  if (check.error || check.status !== 0) throw new Error('The private archive failed its table-of-contents check.');
  const files = path.join(directory, `retailsense-${stamp}-files`);
  const sources = [
    [path.resolve(backendDirectory(), config.PRODUCT_UPLOAD_DIR || '.local/product-images'), 'product-images'],
    [path.resolve(config.AI_STORAGE_ROOT || path.join(root, '.local/ai-center')), 'ai-center'],
    [path.join(root, 'ml-service/models'), 'models'],
  ];
  for (const [source, name] of sources) if (fs.existsSync(source)) {
    fs.mkdirSync(files, { recursive: true });
    fs.cpSync(source, path.join(files, name), { recursive: true, errorOnExist: true, force: false });
  }
  console.log(`Private backup created and archive checked: ${target}`);
  console.log(`Companion uploads, AI files and models (when present): ${files}`);
  console.log('Contains sensitive account data. Keep it off GitHub and store a protected copy separately.');
}
function backendDirectory() { return path.join(root, 'backend'); }
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
