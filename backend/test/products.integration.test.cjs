const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
require('./test-database.cjs').prepareTestEnvironment();
const { catalogFixture } = require('./catalog-fixture.cjs');
test('Global products, precision and category dependencies', async (t) => {
  const f = await catalogFixture(t); const admin = f.cookies.ADMIN;
  const category = await f.fixture('category', { code: f.code(), name: 'Beverages', createdAt: new Date() });
  const unit = await f.fixture('unit', { code: f.code(), name: 'Can' });
  const values = (extra = {}) => ({ sku: f.code(), name: 'Sparkling water', categoryId: category.id, baseUnitId: unit.id, purchaseUnitId: unit.id, purchaseToBaseRatio: '24', defaultCost: '1.25', ...extra });
  let product;
  await t.test('Admin creates and reads product, quantities are absent', async () => {
    const r = await f.create('/products', 'product', admin, values({ barcode: f.code(), trackExpiry: true, shelfLifeDays: 30 }));
    assert.equal(r.status, 201); product = r.body;
    assert.equal(product.purchaseToBaseRatio, '24'); assert.equal(product.defaultCost, '1.25');
    assert.equal(product.baseUnit.id, unit.id); assert.equal('quantity' in product, false);
    const detail = await (await f.request(`/products/${product.id}`, admin)).json(); assert.equal(detail.barcode, product.barcode);
    const result = await (await f.request(`/products?search=${product.sku}&categoryId=${category.id}`, admin)).json(); assert.equal(result.total, 1);
  });
  await t.test('SKU and non-null barcode must be unique; multiple null barcodes allowed', async () => {
    assert.equal((await f.create('/products', 'product', admin, values({ sku: product.sku }))).status, 409);
    assert.equal((await f.create('/products', 'product', admin, values({ barcode: product.barcode }))).status, 409);
    for (let i = 0; i < 2; i++) assert.equal((await f.create('/products', 'product', admin, values({ barcode: null, isActive: false }))).status, 201);
  });
  await t.test('Invalid precision, negative values, overflow and unknown fields rejected', async () => {
    for (const invalid of [{ purchaseToBaseRatio: 0 }, { purchaseToBaseRatio: -1 }, { purchaseToBaseRatio: '1.00001' }, { purchaseToBaseRatio: '10000000000' }, { defaultCost: -1 }, { defaultCost: '0.001' }, { defaultCost: '1000000000000' }, { shelfLifeDays: -1 }, { shelfLifeDays: 1.2 }, { quantity: 5 }, { categoryId: randomUUID() }, { baseUnitId: randomUUID() }]) {
      assert.equal((await f.create('/products', 'product', admin, values(invalid))).status, 400, JSON.stringify(invalid));
    }
  });
  await t.test('Manager and staff cannot create or edit global products', async () => {
    for (const cookie of [f.cookies.STORE_MANAGER, f.cookies.STAFF]) {
      assert.equal((await f.request('/products', cookie, 'POST', values())).status, 403);
      assert.equal((await f.request(`/products/${product.id}`, cookie, 'PATCH', { name: 'Denied' })).status, 403);
    }
    assert.equal((await f.request('/products')).status, 401);
    assert.equal((await f.request(`/products/${product.id}`, admin, 'DELETE')).status, 404);
  });
  await t.test('Active product blocks category deactivation and reactivation requires active category', async () => {
    assert.equal((await f.request(`/categories/${category.id}`, admin, 'PATCH', { isActive: false })).status, 409);
    assert.equal((await f.request(`/products/${product.id}`, admin, 'PATCH', { isActive: false })).status, 200);
    assert.equal((await f.request(`/categories/${category.id}`, admin, 'PATCH', { isActive: false })).status, 200);
    assert.equal((await f.request(`/products/${product.id}`, admin, 'PATCH', { isActive: true })).status, 409);
  });
  await t.test('Database constraints reject invalid direct writes', async () => {
    for (const data of [{ purchaseToBaseRatio: 0 }, { defaultCost: -1 }, { shelfLifeDays: -1 }]) await assert.rejects(f.prisma.product.update({ where: { id: product.id }, data }));
  });
});
