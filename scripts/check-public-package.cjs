// Defense-in-depth review of the exact Git candidate file set. Findings never print secret values.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { root, backendRequire } = require('./database-runtime.cjs');
const { load } = require('./demo-snapshot.cjs');

function scan() {
  const files = [...new Set(execFileSync('git', ['ls-files','-z','--cached','--others','--exclude-standard'],
    { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).split('\0').filter(Boolean))];
  const secrets = [];
  for (const filename of ['backend/.env', 'frontend/.env.local', 'ml-service/.env']) {
    const full = path.join(root, filename);
    if (!fs.existsSync(full)) continue;
    const values = backendRequire('dotenv').parse(fs.readFileSync(full));
    for (const [key, value] of Object.entries(values)) {
      if (/(PASSWORD|SECRET|TOKEN|API_KEY|DATABASE_URL)/.test(key) && value.length >= 12) secrets.push(value);
      if (/DATABASE_URL/.test(key) && value) {
        const password = decodeURIComponent(new URL(value).password);
        if (password.length >= 8) secrets.push(password);
      }
    }
  }
  const findings = [];
  for (const filename of files) {
    if (/(^|\/)(node_modules|\.next|dist|\.venv|\.local|logs|backups|exports)(\/|$)/.test(filename)
      || /(^|\/)\.env(?:\..+)?$/.test(filename) && !filename.endsWith('.env.example')
      || /\.(dump|backup|password|pem|p12)$/.test(filename)) findings.push(`${filename}: private/generated path`);
    const bytes = fs.readFileSync(path.join(root, filename));
    if (bytes.length > 95 * 1024 * 1024) findings.push(`${filename}: exceeds package file size limit`);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    if (secrets.some((secret) => text.includes(secret))) findings.push(`${filename}: matches a local secret`);
    const patterns = [
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/,
      /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
      /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/,
      /\bAKIA[0-9A-Z]{16}\b/,
      /[A-Za-z0-9._%+-]+@(?:gmail|hotmail|outlook|yahoo)\.[A-Za-z.]+/i,
    ];
    if (patterns.some((pattern) => pattern.test(text))) findings.push(`${filename}: possible credential or personal email`);
  }
  const required = ['README.md','Restore-Demo.bat','backend/.env.example','frontend/.env.example','ml-service/.env.example',
    'backend/prisma/schema.prisma','backend/package-lock.json','frontend/package-lock.json',
    'ml-service/models/active-model.json','ml-service/models/demand_model.joblib',
    'ml-service/models/operational/m5-quantity-v2/model.joblib',
    'datasets/demo/snapshot.json','datasets/demo/manifest.json'];
  for (const name of required) if (!files.includes(name)) findings.push(`${name}: required file missing from Git candidate set`);
  load();
  if (findings.length) throw new Error(findings.join('\n'));
  console.log(`PASS: ${files.length} candidate files reviewed; no private/generated paths, known local secrets or detected token/personal-email patterns. Demo package checksums pass.`);
  console.log('This automated scan complements manual diff and snapshot review; it is not a proof against every possible secret format.');
}
if (require.main === module) {
  try { scan(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { scan };
