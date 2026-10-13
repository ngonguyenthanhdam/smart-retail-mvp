const { resolve } = require('node:path');
const { randomBytes } = require('node:crypto');

function validateTestDatabase(applicationUrl, testUrl) {
  let application;
  let target;
  try {
    application = new URL(applicationUrl);
    target = new URL(testUrl);
  } catch {
    throw new Error('Integration tests require DATABASE_URL and TEST_DATABASE_URL.');
  }

  const database = decodeURIComponent(target.pathname.slice(1));
  const applicationDatabase = decodeURIComponent(application.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(target.protocol) ||
      !/^[a-zA-Z0-9_]+_test$/.test(database) || database === applicationDatabase) {
    throw new Error('TEST_DATABASE_URL must name a separate PostgreSQL database ending in _test.');
  }

  return target.toString();
}

function prepareTestEnvironment() {
  require('dotenv').config({ path: resolve(__dirname, '../.env'), quiet: true });
  const connectionString = validateTestDatabase(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
  process.env.DATABASE_URL = connectionString;
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_ORIGIN = 'http://localhost:3000';
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  process.env.JWT_EXPIRES_IN = '8h';
  process.env.DOTENV_CONFIG_QUIET = 'true';
}

module.exports = { prepareTestEnvironment, validateTestDatabase };
