const assert = require('node:assert/strict');
const { test } = require('node:test');
const { businessDate, addDays, expiryStatus } = require('../dist/src/inventory/expiry.js');
test('Expiry uses Vietnam business date and inclusive warning boundary', () => {
  assert.equal(businessDate(new Date('2026-09-25T18:00:00Z')), '2026-09-26');
  assert.equal(addDays('2026-12-30', 7), '2027-01-06');
  assert.equal(expiryStatus(true, '2026-09-24', '2026-09-25', 7), 'EXPIRED');
  assert.equal(expiryStatus(true, '2026-09-25', '2026-09-25', 7), 'EXPIRING_SOON');
  assert.equal(expiryStatus(true, '2026-10-02', '2026-09-25', 7), 'EXPIRING_SOON');
  assert.equal(expiryStatus(true, '2026-10-03', '2026-09-25', 7), 'NORMAL');
  assert.equal(expiryStatus(false, null, '2026-09-25', 7), 'NOT_TRACKED');
  assert.equal(expiryStatus(true, null, '2026-09-25', 7), 'NO_EXPIRY');
});
