require('./load-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  formatVND,
  formatQuantity,
  formatUnit,
  formatQuantityWithUnit,
  formatEstimatedMoney,
} = require('../src/lib/format.ts');
const { resolveLocale } = require('../src/i18n/types.ts');
const { translateMessage } = require('../src/lib/error-copy.ts');

test('VND uses dots in both locales and preserves meaningful decimal digits', () => {
  for (const locale of ['vi', 'en']) {
    assert.equal(resolveLocale(locale), locale);
    for (const [value, expected] of [
      [0, '0 VND'],
      [1000, '1.000 VND'],
      [10000, '10.000 VND'],
      [100000, '100.000 VND'],
      [1000000, '1.000.000 VND'],
      [12500000, '12.500.000 VND'],
      [-1250.5, '-1.250,5 VND'],
      ['999999999999999999.123456', '999.999.999.999.999.999,123456 VND'],
      ['000.0100', '0,01 VND'],
      ['1e-7', '0,0000001 VND'],
      [1e21, '1.000.000.000.000.000.000.000 VND'],
    ]) {
      assert.equal(formatVND(value), expected);
      assert.equal(formatEstimatedMoney(value), expected);
    }
  }
});
test('missing/invalid amounts are never silently replaced with zero', () => {
  for (const value of [
    null,
    undefined,
    '',
    ' ',
    'abc',
    '10,5',
    'NaN',
    NaN,
    Infinity,
    false,
    {},
    [],
    '1e10001',
  ])
    assert.equal(formatVND(value), '—');
  assert.equal(formatVND('-0.00'), '0 VND');
});
test('units use metadata without changing quantities or custom data', () => {
  for (const [value, unit, result] of [
    [100, 'G', '100 g'],
    [500, 'g', '500 g'],
    [1, 'KG', '1 kg'],
    [1.5, 'kg', '1,5 kg'],
    [2000, 'G', '2.000 g'],
  ])
    assert.equal(formatQuantityWithUnit(value, unit), result);
  assert.equal(formatQuantity('2.12345678'), '2,12345678');
  const custom = { code: 'CUSTOM', name: 'Túi của cửa hàng', symbol: null };
  assert.equal(formatUnit(custom, 'en'), 'Túi của cửa hàng');
  assert.equal(formatUnit({ code: 'KG', name: 'Kilogram', symbol: 'KG' }), 'kg');
  assert.equal(formatQuantityWithUnit(500, undefined, 'en'), '500 unit unspecified');
  assert.equal(formatUnit('', 'vi'), 'chưa rõ đơn vị');
  assert.equal(formatUnit({ code: 123, symbol: {} }, 'en'), 'unit unspecified');
  assert.equal(formatQuantityWithUnit(2, 'PCS'), '2 PCS');
  assert.deepEqual(custom, { code: 'CUSTOM', name: 'Túi của cửa hàng', symbol: null });
});
test('Vietnamese is the default regardless of browser-like values', () => {
  for (const value of [undefined, null, 'en-US', 'fr', '', {}])
    assert.equal(resolveLocale(value), 'vi');
});
test('missing translation text falls back to VI without displaying keys', () => {
  const { withFallback } = require('../src/i18n/fallback.ts');
  assert.deepEqual(withFallback(['T2', 'T3'], ['Mon', '']), ['Mon', 'T3']);
  assert.deepEqual(
    withFallback(
      { title: 'Sản phẩm', nested: { save: 'Lưu', cancel: 'Hủy' } },
      { title: 'Products', nested: { save: '' } },
    ),
    { title: 'Products', nested: { save: 'Lưu', cancel: 'Hủy' } },
  );
});
function compare(vi, en, key = '') {
  assert.equal(typeof en, typeof vi, key);
  if (typeof vi === 'object') {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(vi).sort(), key);
    for (const child of Object.keys(vi)) compare(vi[child], en[child], `${key}.${child}`);
  } else if (typeof vi === 'string') {
    assert.ok(en.trim(), key);
    assert.doesNotMatch(en, /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệịỉĩọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹ]/i, key);
  } else if (typeof vi === 'function') assert.equal(vi.length, en.length, key);
}
test('every namespace has complete VI/EN keys and interpolation signatures', () => {
  for (const dir of ['messages', 'screens'])
    for (const file of fs.readdirSync(path.join(__dirname, '../src/i18n', dir))) {
      if (file === 'index.ts') continue;
      const copy = require(`../src/i18n/${dir}/${file}`);
      compare(copy.vi, copy.en, file);
      assert.deepEqual(
        require('../src/i18n/fallback.ts').withFallback(copy.vi, copy.en),
        copy.en,
        file,
      );
    }
  compare(
    require('../src/i18n/planning.ts').planningCopy,
    require('../src/i18n/planning-en.ts').planningEn,
    'planning',
  );
  const dynamic = require('../src/i18n/dynamic.ts');
  compare(dynamic.vi, dynamic.en, 'dynamic');
  for (const file of ['dashboard', 'status']) {
    const copy = Object.values(require(`../src/i18n/${file}.ts`))[0];
    compare(copy.vi, copy.en, file);
  }
});

test('components and routes keep Vietnamese UI text in dictionaries', () => {
  const ts = require('typescript');
  const allowed = {
    'language-switcher.tsx': new Set(['Ngôn ngữ giao diện', 'Tiếng Việt']),
    // Backend-defined source column keys: preserve the wire format.
    'chat-panel.tsx': new Set(['Hóa đơn', 'Chi phí (VND)']),
  };
  const failures = [];
  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        scan(file);
        continue;
      }
      if (!/\.tsx?$/.test(file)) continue;
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node) {
        if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node) ||
          ts.isJsxText(node) ||
          ts.isIdentifier(node)
        ) {
          const value = node.text.trim();
          if (/\p{M}|đ|Đ/u.test(value.normalize('NFD')) && !allowed[entry.name]?.has(value))
            failures.push(`${path.relative(__dirname, file)}: ${value}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(path.join(__dirname, '../src/components'));
  scan(path.join(__dirname, '../src/app'));
  assert.deepEqual(failures, []);
});
test('backend errors are translated by code; unknown messages and user text stay intact', () => {
  assert.match(translateMessage('server text', 400, 'INSUFFICIENT_STOCK', 'en'), /unexpired stock/);
  assert.equal(translateMessage('Cà phê nguyên chất', 400, undefined, 'en'), 'Cà phê nguyên chất');
  assert.equal(
    translateMessage('Unknown custom field', 400, undefined, 'vi'),
    'Unknown custom field',
  );
  assert.match(translateMessage('', 403, undefined, 'en'), /permission/);
});
test('frontend feedback already visible updates without changing embedded user data', () => {
  const { localizeFeedback } = require('../src/i18n/feedback.tsx');
  const { vi, en } = require('../src/i18n/dynamic.ts');
  assert.equal(localizeFeedback('Nhập mật khẩu.', 'en'), 'Enter your password.');
  const filename = 'Cà phê nguyên chất.csv';
  assert.equal(
    localizeFeedback(vi.importResult(5, filename, 2), 'en'),
    en.importResult('5', filename, '2'),
  );
  assert.equal(localizeFeedback('A custom message', 'vi'), 'A custom message');
  assert.equal(
    localizeFeedback(['A custom message', 'Nhập mật khẩu.'], 'en'),
    'A custom message Enter your password.',
  );
});
