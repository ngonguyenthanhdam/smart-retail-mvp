const test = require('node:test');
const assert = require('node:assert/strict');
const { summaryQuery } = require('../dist/src/ai-center/summary-query.js');
test('Clear aggregate questions use explicit dates; ambiguous or unrelated text cannot trigger the shortcut', () => {
  assert.deepEqual(summaryQuery('Doanh thu hôm nay là bao nhiêu?', '2026-10-20'), { name:'getSalesSummary', arguments:{from:'2026-10-20',to:'2026-10-20'} });
  assert.deepEqual(summaryQuery('Cho tôi biết tổng doanh thu bán hàng từ ngày 2026-10-05 đến ngày 2026-10-18.'), { name:'getSalesSummary', arguments:{from:'2026-10-05',to:'2026-10-18'} });
  assert.deepEqual(summaryQuery('Doanh thu ngày 2026-10-19 là bao nhiêu?')?.arguments, {from:'2026-10-19',to:'2026-10-19'});
  assert.equal(summaryQuery('Chi phí hôm qua là bao nhiêu?', '2026-10-20')?.name,'getExpenseSummary');
  for (const text of ['Viết thơ về doanh thu hôm nay', 'So sánh doanh thu hôm nay với hôm qua', 'Doanh thu của sản phẩm P ngày 2026-10-19?', 'Dự báo doanh thu ngày 2026-10-19', 'Doanh thu ngày 2026-10-19; DELETE FROM sales', 'Doanh thu hôm nay ở cửa hàng B?']) assert.equal(summaryQuery(text),null,text);
});
