const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
const { businessDate, addDays } = require('../dist/src/inventory/expiry.js');
test('Inventory aggregation, expiry, lot ordering and scope', async (t) => {
  const f = await catalogFixture(t); const { ADMIN: admin, STORE_MANAGER: manager, STAFF: staff } = f.cookies;
  const today = businessDate();
  const category = await f.fixture('category', { code: f.code(), name: 'Food', createdAt: new Date() });
  const unit = await f.fixture('unit', { code: f.code(), name: 'Piece' });
  const anotherUnit = await f.fixture('unit', { code: f.code(), name: 'Box' });
  const warehouse = await f.fixture('location', { code: f.code(), name: 'Warehouse', locationType: 'CENTRAL_WAREHOUSE', createdAt: new Date() });
  const product = (trackExpiry) => f.fixture('product', { sku: f.code(), name: trackExpiry ? 'Milk' : 'Rice', categoryId: category.id, baseUnitId: unit.id, purchaseUnitId: unit.id, trackExpiry, createdAt: new Date() });
  const milk = await product(true); const rice = await product(false); const empty = await product(false);
  for (const productId of [milk.id, rice.id, empty.id]) await f.fixture('storeProduct', { locationId: f.storeA.id, productId, sellingPrice: 12, safetyStock: 4, minStockLevel: 2 });
  const lot = (locationId, productId, name, quantity, receivedOffset, expiryOffset) => f.fixture('inventoryLot', {
    locationId, productId, lotNumber: name, quantityOnHand: quantity, unitCost: '3.50', receivedDate: new Date(addDays(today, receivedOffset)),
    expiryDate: expiryOffset === null ? null : new Date(addDays(today, expiryOffset)), purchaseOrderItemId: null, createdAt: new Date(),
  });
  await lot(f.storeA.id, milk.id, 'LATER', '4.125', -5, 20);
  await lot(f.storeA.id, milk.id, 'SOON', '2.375', -4, 3);
  await lot(f.storeA.id, milk.id, 'EXPIRED', '1', -8, -1);
  await lot(f.storeA.id, milk.id, 'DEPLETED', '0', -10, -5);
  await lot(f.storeA.id, rice.id, 'NEW', '1', -1, null);
  await lot(f.storeA.id, rice.id, 'OLD', '1', -6, null);
  await lot(f.storeB.id, milk.id, 'OTHER', '50', -5, 12);
  await lot(warehouse.id, milk.id, 'WAREHOUSE', '100', -3, 15);
  const get = async (path, cookie = admin) => { const response = await f.request(path, cookie); assert.equal(response.status, 200); return response.json(); };
  await t.test('Aggregation uses view sum, includes expired stock, and shows configured zero stock', async () => {
    const rows = await get(`/inventory?locationId=${f.storeA.id}`);
    assert.equal(rows.total, 3);
    const m = rows.items.find((r) => r.productId === milk.id); assert.equal(Number(m.currentQuantity), 7.5); assert.equal(m.expiryStatus, 'EXPIRED'); assert.equal(m.earliestExpiry, addDays(today, -1));
    assert.equal(Number(rows.items.find((r) => r.productId === empty.id).currentQuantity), 0);
    const view = await f.prisma.$queryRaw`SELECT current_quantity FROM v_inventory_balance WHERE location_id = ${f.storeA.id}::uuid AND product_id = ${milk.id}::uuid`;
    assert.equal(view[0].current_quantity.toString(), '7.5');
  });
  await t.test('Low stock is inclusive; location/product/category filters and pagination work', async () => {
    const rows = await get(`/inventory?locationId=${f.storeA.id}&lowStock=true`);
    assert.equal(rows.total, 2); assert.ok(rows.items.some((r) => r.productId === rice.id));
    const filtered = await get(`/inventory?productId=${milk.id}&categoryId=${category.id}&pageSize=1`); assert.equal(filtered.total, 3); assert.equal(filtered.items.length, 1);
    assert.equal((await f.request('/inventory?lowStock=bad', admin)).status, 400);
  });
  await t.test('FEFO sorts expiry first, FIFO sorts receipt first; dates and costs are explicit', async () => {
    const m = await get(`/inventory/${f.storeA.id}/${milk.id}/lots`, manager);
    assert.equal(m.ordering, 'FEFO'); assert.deepEqual(m.items.map((r) => r.lotNumber), ['DEPLETED', 'EXPIRED', 'SOON', 'LATER']);
    assert.equal(m.items.find((r) => r.lotNumber === 'SOON').expiryStatus, 'EXPIRING_SOON');
    assert.equal(m.items.find((r) => r.lotNumber === 'LATER').expiryStatus, 'NORMAL'); assert.equal(m.items[0].unitCost, '3.5');
    const r = await get(`/inventory/${f.storeA.id}/${rice.id}/lots`, manager);
    assert.equal(r.ordering, 'FIFO'); assert.deepEqual(r.items.map((r) => r.lotNumber), ['OLD', 'NEW']); assert.equal(r.items[0].expiryDate, null);
    const zero = await get(`/inventory/${f.storeA.id}/${empty.id}/lots`); assert.equal(zero.items.length, 0);
  });
  await t.test('Admin sees all locations; manager/staff cannot access another store or warehouse', async () => {
    const all = await get('/inventory'); assert.ok(all.items.some((r) => r.locationId === warehouse.id));
    for (const cookie of [manager, staff]) {
      const own = await get('/inventory', cookie); assert.ok(own.items.every((r) => r.locationId === f.storeA.id));
      for (const location of [f.storeB, warehouse]) {
        assert.equal((await f.request(`/inventory?locationId=${location.id}`, cookie)).status, 403);
        assert.equal((await f.request(`/inventory/${location.id}/${milk.id}/lots`, cookie)).status, 403);
      }
    }
    const visible = await get(`/inventory/${f.storeA.id}/${milk.id}/lots`, staff);
    assert.ok(visible.items.every((r) => !('unitCost' in r))); assert.equal(JSON.stringify(visible).includes('defaultCost'), false);
  });
  await t.test('No manual stock mutation APIs; nullable legacy lot sources and Phase 3 FK', async () => {
    for (const [path, method] of [['/inventory', 'POST'], ['/inventory/lots', 'POST'], [`/inventory/${f.storeA.id}/${milk.id}/lots`, 'POST']]) assert.equal((await f.request(path, admin, method, { quantity: 5 })).status, 404);
    assert.equal(await f.prisma.inventoryLot.count({ where: { id: { in: f.ids.inventoryLot }, purchaseOrderItemId: { not: null } } }), 0);
    const tables = await f.prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    assert.deepEqual(tables.map((r) => r.tablename).sort(), ['_prisma_migrations', 'ai_audit_events', 'ai_chat_messages', 'ai_chat_sessions', 'ai_dataset_files', 'ai_datasets', 'ai_deployments', 'ai_training_jobs', 'categories', 'demand_forecasts', 'expenses', 'forecast_runs', 'import_jobs', 'inventory_alerts', 'inventory_lots', 'locations', 'products', 'purchase_order_items', 'purchase_orders', 'replenishment_recommendations', 'roles', 'sale_items', 'sales', 'sales_history_coverage', 'store_products', 'units', 'users']);
    const columns = await f.prisma.$queryRaw`SELECT is_nullable, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_lots' AND column_name = 'purchase_order_item_id'`;
    assert.deepEqual(columns, [{ is_nullable: 'YES', data_type: 'uuid' }]);
    const foreignKeys = await f.prisma.$queryRaw`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'inventory_lots'::regclass AND contype = 'f'`;
    assert.equal(foreignKeys.length, 3); assert.ok(foreignKeys.some((r) => r.definition.includes('purchase_order_item_id') && r.definition.includes('purchase_order_items')));
    await assert.rejects(f.prisma.inventoryLot.update({ where: { id: f.ids.inventoryLot[0] }, data: { purchaseOrderItemId: require('node:crypto').randomUUID() } }));
  });
  await t.test('Stock cannot be reinterpreted by changing base units or enabling expiry with undated lots', async () => {
    assert.equal((await f.request(`/products/${milk.id}`, admin, 'PATCH', { baseUnitId: anotherUnit.id })).status, 409);
    assert.equal((await f.request(`/products/${rice.id}`, admin, 'PATCH', { trackExpiry: true })).status, 409);
    for (const data of [{ quantityOnHand: -1 }, { unitCost: -1 }]) await assert.rejects(f.prisma.inventoryLot.update({ where: { id: f.ids.inventoryLot[0] }, data }));
  });
});
