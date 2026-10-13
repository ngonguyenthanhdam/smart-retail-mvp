const assert = require('node:assert/strict');
const { test } = require('node:test');
const { calendarMonths, predictionDays, demandWindow } = require('../dist/src/forecasts/forecast-period.js');
const { addDays } = require('../dist/src/inventory/expiry.js');

test('Calendar months have actual boundaries and retain at least 30 operational days', () => {
  assert.deepEqual(calendarMonths('2026-01-31',1),[{start:'2026-02-01',end:'2026-02-28'}]);
  assert.deepEqual(calendarMonths('2028-01-31',1),[{start:'2028-02-01',end:'2028-02-29'}]);
  assert.equal(predictionDays('2026-01-31',1),30);
  assert.equal(predictionDays('2028-01-31',1),30);
  assert.deepEqual(calendarMonths('2026-11-15',3),[{start:'2026-12-01',end:'2026-12-31'},{start:'2027-01-01',end:'2027-01-31'},{start:'2027-02-01',end:'2027-02-28'}]);
  for (let month=1;month<=12;month++) assert.ok(predictionDays(`2026-${String(month).padStart(2,'0')}-01`,3)<=124);
});
test('Operational windows require every future day; no monthly average fills missing days', () => {
  const saved = [{locationId:'s',productId:'p',dataSource:'STORE_HISTORY',daily:Array.from({length:60},(_,i)=>({date:addDays('2026-01-01',i),quantity:i<30?2:4}))}];
  assert.equal(demandWindow(saved,'s','p','2026-01-01',30).quantity.toFixed(),'60');
  assert.equal(demandWindow(saved,'s','p','2026-01-31',30).quantity.toFixed(),'120');
  assert.equal(demandWindow(saved,'s','p','2026-02-01',30),null);
  assert.equal(demandWindow(null,'s','p','2026-01-01',30),null);
  saved[0].daily.splice(3,1);
  assert.equal(demandWindow(saved,'s','p','2026-01-01',30),null);
});
