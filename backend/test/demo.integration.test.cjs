const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
const { demoId, seedProductInventoryDemo } = require('../dist/prisma/demo.js');
test('Demo setup is minimal and does not replenish or overwrite on rerun', async (t) => {
  const f = await catalogFixture(t);
  const owned = { category: [1, 2], unit: [3, 4, 5], location: [6, 7], product: [8, 9, 10], storeProduct: [11, 12, 13, 14], inventoryLot: [15, 16, 17, 18, 19] };
  for (const [model, numbers] of Object.entries(owned)) assert.equal(await f.prisma[model].count({ where: { id: { in: numbers.map(demoId) } } }), 0, 'Demo test IDs must be unoccupied');
  for (const [model, numbers] of Object.entries(owned)) f.ids[model].push(...numbers.map(demoId));
  const result = await seedProductInventoryDemo(f.prisma); assert.equal(result.lots, 5);
  await f.prisma.inventoryLot.update({ where: { id: demoId(15) }, data: { quantityOnHand: '1' } });
  await f.prisma.product.update({ where: { id: demoId(8) }, data: { name: 'Edited demo product' } });
  await seedProductInventoryDemo(f.prisma);
  assert.equal((await f.prisma.inventoryLot.findUniqueOrThrow({ where: { id: demoId(15) } })).quantityOnHand.toString(), '1');
  assert.equal((await f.prisma.product.findUniqueOrThrow({ where: { id: demoId(8) } })).name, 'Edited demo product');
  assert.equal(await f.prisma.inventoryLot.count({ where: { id: { in: owned.inventoryLot.map(demoId) } } }), 5);
});
