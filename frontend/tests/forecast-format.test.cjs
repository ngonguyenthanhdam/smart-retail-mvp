require('./load-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatForecastMonthlyQuantity: monthly,
  formatForecastDailyQuantity: daily,
  formatForecastMoney: money,
  formatForecastDailyAverage: average,
  formatForecastRevenueTotal: total,
} = require('../src/lib/forecast-format.ts');
const { formatVND, formatQuantity } = require('../src/lib/format.ts');

test('forecast display rounds monthly units, daily quantities and VND independently', () => {
  assert.equal(monthly('188.2143'), '188');
  assert.equal(monthly('213.6786'), '214');
  assert.equal(monthly('76.1604'), '76');
  assert.equal(monthly('2000.5'), '2.001');
  assert.equal(daily('6.071429'), '6,1');
  assert.equal(daily('6.000000'), '6');
  assert.equal(daily('6.05'), '6,1');
  assert.equal(daily('9.99'), '10');
  assert.equal(money('1411607.25'), '1.411.607 VND');
  assert.equal(money('1411607.50'), '1.411.608 VND');
  assert.equal(money('7500.25'), '7.500 VND');
  assert.equal(money('999999999999999999.5'), '1.000.000.000.000.000.000 VND');
  assert.equal(monthly('1.234e3'), '1.234');
});

test('zero stays zero; invalid and missing forecast values never become zero', () => {
  for (const value of [0, '0', '-0.0000', 0n]) {
    assert.equal(monthly(value), '0');
    assert.equal(daily(value), '0');
    assert.equal(money(value), '0 VND');
  }
  assert.equal(monthly(-0.4), '0');
  assert.equal(daily(-0.04), '0');
  assert.equal(monthly(-1.5), '-2');
  assert.equal(daily(-1.25), '-1,3');
  for (const value of [
    null,
    undefined,
    '',
    ' ',
    'abc',
    '10,5',
    '0x10',
    NaN,
    Infinity,
    -Infinity,
    false,
    {},
    [],
    '1e9999',
  ]) {
    assert.equal(monthly(value), '—');
    assert.equal(daily(value), '—');
    assert.equal(money(value), '—');
    assert.equal(average(value, '2026-01-01', '2026-01-31'), '—');
  }
});

test('averages and totals use unrounded inputs; source and general-purpose formatting stay intact', () => {
  const source = Object.freeze({ quantity: '188.2143', revenues: Object.freeze(['0.49', '0.49']) });
  assert.equal(average(source.quantity, '2026-01-01', '2026-01-31'), '6,1');
  assert.equal(average('1.49', '2026-01-01', '2026-01-02'), '0,7');
  assert.equal(average(0, '2026-02-01', '2026-02-28'), '0');
  assert.equal(average(29, '2028-02-01', '2028-02-29'), '1');
  assert.equal(average(5, 'invalid', '2026-01-31'), '—');
  assert.equal(average(5, '2026-01-31', '2026-01-01'), '—');
  assert.equal(total(source.revenues), '1 VND');
  assert.equal(total([0, '0']), '0 VND');
  assert.equal(total(['1000', null]), '—');
  assert.equal(total(['1000', 'bad']), '—');
  assert.equal(formatQuantity(source.quantity), '188,2143');
  assert.equal(formatVND('1411607.25'), '1.411.607,25 VND');
  assert.deepEqual(source, { quantity: '188.2143', revenues: ['0.49', '0.49'] });
});
