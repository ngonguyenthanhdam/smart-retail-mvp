const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Prisma } = require('../dist/generated/prisma/client.js');
const { databaseError } = require('../dist/src/common/database-errors.js');

test('Database uniqueness failures return a useful conflict without internal error details', () => {
  const error = new Prisma.PrismaClientKnownRequestError('Private constraint detail', { code: 'P2002', clientVersion: 'test' });
  assert.throws(() => databaseError(error), (result) => result.getStatus() === 409 && !result.message.includes('Private'));
});

test('Prisma serialization failures return a retryable conflict', () => {
  const error = new Prisma.PrismaClientKnownRequestError('Serialization failure', { code: 'P2034', clientVersion: 'test' });
  assert.throws(() => databaseError(error), (result) => result.getStatus() === 409 && /Refresh/.test(result.message));
});

test('An unwrapped adapter conflict at transaction commit also returns 409', () => {
  const error = new Error('TransactionWriteConflict', { cause: { kind: 'TransactionWriteConflict', originalCode: '40001' } });
  error.name = 'DriverAdapterError';
  assert.throws(() => databaseError(error), (result) => result.getStatus() === 409 && !result.message.includes('40001'));
});

test('Unrelated driver or application errors are not misreported as conflicts', () => {
  const error = new Error('Unavailable', { cause: { kind: 'DatabaseNotReachable' } });
  error.name = 'DriverAdapterError';
  assert.throws(() => databaseError(error), (result) => result === error);
  const unknown = new Error('Unknown fault');
  assert.throws(() => databaseError(unknown), (result) => result === unknown);
});
