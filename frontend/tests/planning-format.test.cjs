require('./load-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatPlanningQuantity: label } = require('../src/lib/planning-format.ts');
const { formatQuantity } = require('../src/lib/format.ts');

test('planning summaries round without presenting approximate values as exact', () => {
  assert.equal(label('108.4096'), '≈ 108');
  assert.equal(label('124.1466'), '≈ 124');
  assert.equal(label('705.2748'), '≈ 705');
  assert.equal(label('999.5'), '≈ 1.000');
  assert.equal(label('103.4096', 0, true), '≈ 103');
  assert.equal(label('5.0000', 1), '5');
  assert.equal(label('5.25', 1), '≈ 5,3');
  assert.equal(label('15.5', 1), '15,5');
  assert.equal(label('999999999999999999.5'), '≈ 1.000.000.000.000.000.000');
});

test('missing and tiny quantities cannot be mistaken for zero stock', () => {
  for (const value of [null, undefined, '', ' ', 'bad', NaN, Infinity, false, {}, '0x10']) {
    assert.equal(label(value), '—');
    assert.equal(label(value, 1, true), '—');
  }
  for (const value of [0, '0', '-0.000', 0n]) assert.equal(label(value), '0');
  assert.equal(label('0.04'), '< 1');
  assert.equal(label('0.04', 1), '< 0,1');
  assert.equal(label('-0.04', 1), '> -0,1');
});

test('summary formatting preserves original values for decisions and calculations', () => {
  const source = Object.freeze({ recommended: '108.4096', approved: '123.4567' });
  label(source.recommended);
  label(source.approved);
  assert.deepEqual(source, { recommended: '108.4096', approved: '123.4567' });
  assert.equal(formatQuantity(source.recommended), '108,4096');
  assert.equal(formatQuantity(source.approved), '123,4567');
});
