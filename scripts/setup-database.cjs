// Local bootstrap only. Credentials are read from private files, never arguments.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(root, 'backend/package.json'));
const { Client } = backendRequire('pg');
const configuration = backendRequire('dotenv').parse(fs.readFileSync(path.join(root, 'backend/.env')));

async function provision() {
  const state = JSON.parse(fs.readFileSync(path.join(root, '.local/setup-state.json'), 'utf8'));
  const uri = new URL(configuration.DATABASE_URL);
  if (!state.managedDatabase || uri.hostname !== 'localhost' || Number(uri.port) !== state.port ||
      uri.username !== 'retailsense' || uri.pathname !== '/retailsense') {
    throw new Error('Automatic provisioning requires the dedicated setup-created local database.');
  }
  const password = decodeURIComponent(uri.password);
  const admin = new Client({ host: 'localhost', port: state.port, database: 'postgres', user: 'postgres',
    password: fs.readFileSync(path.join(root, '.local/postgresql/superuser.password'), 'utf8').trim(),
    connectionTimeoutMillis: 10000 });
  await admin.connect();
  try {
    const role = await admin.query("SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'retailsense'");
    if (!role.rowCount) {
      const statement = await admin.query("SELECT format('CREATE ROLE retailsense LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', $1::text) AS sql", [password]);
      await admin.query(statement.rows[0].sql);
    } else if (Object.values(role.rows[0]).some(Boolean)) {
      throw new Error('The existing application role has elevated privileges. It was not altered.');
    }
    for (const name of ['retailsense', 'retailsense_test']) {
      const existing = await admin.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1', [name]);
      if (existing.rowCount && existing.rows[0].owner !== 'retailsense') {
        throw new Error('An existing database belongs to a different role. It was not changed.');
      }
      if (!existing.rowCount) await admin.query(`CREATE DATABASE ${name} OWNER retailsense`);
    }
  } finally { await admin.end(); }
  const application = new Client({ connectionString: configuration.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try { await application.connect(); await application.query('SELECT 1'); }
  finally { await application.end(); }
  console.log('Local application and test databases are ready; existing roles/passwords were preserved.');
}

async function bootstrap() {
  const { PrismaPg } = backendRequire('@prisma/adapter-pg');
  const { PrismaClient } = require('../backend/dist/generated/prisma/client');
  const { seedAuthentication, loadInitialAdmin } = require('../backend/dist/prisma/seed');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: configuration.DATABASE_URL, options: '-c timezone=UTC' }) });
  try {
    const existing = await prisma.user.count({ where: { role: { code: 'ADMIN' } } });
    if (existing > 0) {
      console.log('Existing administrator preserved; no user or password changed.');
      return;
    }
    console.log(`Initial ADMIN: ${await seedAuthentication(prisma, loadInitialAdmin(configuration))}. No demo data seeded.`);
  } finally { await prisma.$disconnect(); }
}

const action = process.argv[2];
Promise.resolve().then(() => {
  if (action === 'provision') return provision();
  if (action === 'bootstrap') return bootstrap();
  throw new Error('Expected provision or bootstrap.');
}).catch(() => {
  // Database errors can contain URLs or SQL values. Keep credentials out of logs.
  console.error('Local database setup failed. Check backend/.env, project PostgreSQL and existing role/database ownership. Nothing was reset.');
  process.exitCode = 1;
});
