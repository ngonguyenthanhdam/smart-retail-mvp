const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Workbook } = require('exceljs');
const { zipSync } = require('fflate');
const { readImportFile, MAX_BYTES } = require('../dist/src/imports/import-file.js');
const header = ['expense_type', 'amount', 'expense_date', 'description'];

test('Auto detection recognizes operational templates and directs AI datasets to AI Center', async () => {
  const fs = require('node:fs/promises'), path = require('node:path');
  for (const [name, type] of [['01-products.csv','PRODUCT'],['02-sales.csv','SALE'],['03-expenses.csv','EXPENSE'],['04-opening-inventory.csv','INVENTORY']]) {
    const bytes = await fs.readFile(path.resolve(__dirname, '../../datasets/chatbot-business', name));
    const parsed = await readImportFile(name, bytes);
    assert.equal(parsed.importType, type); assert.ok(parsed.rows.length > 0);
  }
  await assert.rejects(readImportFile('a.csv', Buffer.from('date,store_id,product_id,quantity,unit_code\n2026-01-01,S,P,1,PCS')), /AI Center/);
  await assert.rejects(readImportFile('a.csv', Buffer.from('title,author\nNovel,Writer')), /Không nhận diện/);
});
test('CSV preserves BOM, quoted commas/newlines and decimal strings', async () => {
  const source = await readImportFile('a.csv', Buffer.from('\ufeff' + header.join(',') + '\nOTHER,12.50,2026-09-01,"Office,\nsupplies"'), 'EXPENSE');
  assert.equal(source.rows[0].values.amount, '12.50'); assert.equal(source.rows[0].values.description, 'Office,\nsupplies');
  assert.equal(source.rows[0].row, 3);
});
test('XLSX literals are supported and formulas produce row errors', async () => {
  const book = new Workbook(); const sheet = book.addWorksheet('Expenses');
  sheet.addRow(header); sheet.addRow(['OTHER', 10, '2026-09-01', 'Supplies']); sheet.addRow(['OTHER', { formula: '5+5', result: 10 }, '2026-09-01', 'Formula']);
  const source = await readImportFile('a.xlsx', Buffer.from(await book.xlsx.writeBuffer()), 'EXPENSE');
  assert.equal(source.rows[0].values.amount, '10'); assert.match(source.rows[1].error, /literal/);
});
test('Unsupported, malformed, oversized, excessive-row and ambiguous-header files fail', async () => {
  for (const [name, data] of [['a.xls', Buffer.from('bad')], ['a.xlsx', Buffer.from('bad')], ['a.csv', Buffer.alloc(MAX_BYTES + 1)],
    ['a.csv', Buffer.from('expense_type,amount,expense_date,amount\nOTHER,1,2026-09-01,1')],
    ['a.csv', Buffer.from('expense_type,amount,expense_date\n' + 'OTHER,1,2026-09-01\n'.repeat(1001))]]) {
    await assert.rejects(readImportFile(name, data, 'EXPENSE'), { status: 400 });
  }
});
test('Large expanded workbooks are rejected before workbook loading', async () => {
  const buffer = Buffer.from(zipSync({ 'large.xml': new Uint8Array(21 * 1024 * 1024) }));
  await assert.rejects(readImportFile('a.xlsx', buffer, 'EXPENSE'), { status: 400 });
});
