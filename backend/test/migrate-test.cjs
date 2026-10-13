const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { prepareTestEnvironment } = require('./test-database.cjs');

prepareTestEnvironment();

const result = spawnSync(process.execPath, [
  resolve(__dirname, '../node_modules/prisma/build/index.js'), 'migrate', 'deploy',
], {
  cwd: resolve(__dirname, '..'),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error('Could not run Prisma migrations against the test database.');
}
process.exitCode = result.status ?? 1;
