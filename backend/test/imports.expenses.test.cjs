const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
test('Expense import validates types/dates/amounts and preserves company/store scope', async (t) => {
  const f = await catalogFixture(t);
  const data = ['expense_type,amount,expense_date,location_code,description',
    `RENT,20,2025-02-01,${f.storeA.code},Rent`, 'SALARY,30,2025-02-01,,Company',
    `OTHER,40,2025-02-01,${f.storeB.code},Other store`, 'CUSTOM,10,2025-02-01,,Bad type',
    'OTHER,-1,2025-02-01,,Bad amount', 'OTHER,10,2025-02-30,,Bad date'].join('\n');
  const before = await f.prisma.expense.count(); const preview = await f.upload('EXPENSE', data);
  assert.equal(preview.body.validRows, 3); assert.equal(preview.body.invalidRows, 3); assert.equal(await f.prisma.expense.count(), before);
  const result = await f.request(`/imports/${preview.body.id}/confirm`, f.cookies.ADMIN, 'POST', { previewToken: preview.body.previewToken }); assert.equal(result.status, 201);
  const own = await (await f.request('/expenses?from=2025-02-01&to=2025-02-01', f.cookies.STORE_MANAGER)).json();
  assert.equal(own.items.length, 1); assert.equal(own.items[0].amount, '20'); assert.equal(own.items[0].locationId, f.storeA.id);
  assert.equal((await f.request('/expenses', f.cookies.STAFF)).status, 403);
});
