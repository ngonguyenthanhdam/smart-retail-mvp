import { test, expect, type Page } from '@playwright/test';
import { mockApi, product, store, category, unit, storeProduct } from './fixtures';

async function english(page: Page) {
  await page.getByRole('button', { name: 'English', exact: true }).first().click();
}

for (const role of ['ADMIN', 'STORE_MANAGER']) {
  test(`${role} has history, no POS, and direct POS navigation is redirected`, async ({ page }) => {
    await mockApi(page, { role });
    await page.goto('/sales');
    await expect(page).toHaveURL(/\/sales\/history$/);
    await english(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Sales history' })).toBeVisible();
    await expect(page.locator('nav a[href="/sales"]')).toHaveCount(0);
    await expect(page.locator('nav a[href="/sales/history"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Point of sale', exact: true })).toHaveCount(0);
    await expect(page.locator('.pos-workspace')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New sale', exact: true })).toHaveCount(0);
  });
}

test('STAFF keeps POS and sales history with blank areas for missing images', async ({ page }) => {
  await mockApi(page, { role: 'STAFF' });
  await page.goto('/sales');
  await english(page);
  await expect(page.locator('nav a[href="/sales"]')).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`Add ${product.name}`) })).toBeVisible();
  await expect(page.locator('.product-image img')).toHaveCount(0);
  await expect(page.locator('.product-image').first()).toBeEmpty();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.goto('/sales/history');
  await expect(page.getByRole('heading', { level: 1, name: 'Sales history' })).toBeVisible();
});

test('Manager form sends exactly price and thresholds with no assignment controls', async ({ page }) => {
  const api = await mockApi(page, { role: 'STORE_MANAGER' });
  await page.goto('/products');
  await english(page);
  await expect(page.getByRole('button', { name: 'Configure product', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(`Edit ${product.name}`) }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[name="isActive"]')).toHaveCount(0);
  await dialog.locator('[name="sellingPrice"]').fill('22.50');
  await dialog.locator('[name="minStockLevel"]').fill('3');
  await dialog.locator('[name="safetyStock"]').fill('8');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0]).toEqual({ path: `/store-products/${storeProduct.id}`, body: { sellingPrice: '22.50', minStockLevel: '3', safetyStock: '8' } });
});

test('Admin single-store configuration initializes the selected product defaults', async ({ page }) => {
  await mockApi(page);
  await page.route('**/products?**', async (route) => route.fulfill({ json: {
    items: [{ ...product, defaultSellingPrice: '12500', defaultMinStockLevel: '2.5', defaultSafetyStock: '6' }], total: 1, page: 1, pageSize: 100,
  } }));
  await page.goto('/products/store-settings');
  await english(page);
  await page.getByRole('button', { name: 'Configure product', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name="productId"]').selectOption(product.id);
  await expect(dialog.locator('[name="sellingPrice"]')).toHaveValue('12500');
  await expect(dialog.locator('[name="minStockLevel"]')).toHaveValue('2.5');
  await expect(dialog.locator('[name="safetyStock"]')).toHaveValue('6');
});

test('Admin selects stores and defaults, uploads a preview, and retains form values across locales', async ({ page }) => {
  await mockApi(page);
  const stores = [store, { ...store, id: 'store-2', code: 'B', name: 'Store B' }, { ...store, id: 'store-3', code: 'C', name: 'Store C' }];
  await page.route('**/locations?**', async (route) => route.fulfill({ json: { items: stores, total: 3, page: 1, pageSize: 100 } }));
  let submitted = '';
  await page.route('**/products', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    submitted = route.request().postData() ?? '';
    return route.fulfill({ status: 201, json: { id: 'created' } });
  });
  await page.goto('/products');
  await english(page);
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name="sku"]').fill('NEW-SKU');
  await dialog.locator('[name="name"]').fill('Fish');
  await dialog.locator('[name="categoryId"]').selectOption(category.id);
  await dialog.locator('[name="baseUnitId"]').selectOption(unit.id);
  await dialog.locator('[name="purchaseUnitId"]').selectOption(unit.id);
  await dialog.locator('[name="defaultSellingPrice"]').fill('12500');
  await dialog.locator('[name="defaultMinStockLevel"]').fill('2');
  await dialog.locator('[name="defaultSafetyStock"]').fill('5');
  await dialog.getByRole('checkbox', { name: new RegExp(store.name) }).check();
  await dialog.getByRole('checkbox', { name: 'Store B (B)' }).check();
  await dialog.locator('#product-image-upload').setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT3sAAAAASUVORK5CYII=', 'base64') });
  await expect(dialog.locator('.product-image img')).toHaveAttribute('src', /^blob:/);
  await dialog.getByRole('button', { name: 'Tiếng Việt', exact: true }).click();
  await expect(dialog.locator('[name="defaultSellingPrice"]')).toHaveValue('12500');
  await expect(dialog.getByRole('checkbox', { name: new RegExp(store.name) })).toBeChecked();
  await dialog.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect.poll(() => submitted).toContain('"storeIds":["store-1","store-2"]');
  expect(submitted).toContain('"defaultSellingPrice":"12500"');
  expect(submitted).toContain('filename="image.png"');
  await expect(dialog).not.toBeVisible();
});

test('Stock warning displays quantity and only confirmed resubmission discontinues', async ({ page }) => {
  await mockApi(page);
  let calls = 0;
  await page.route('**/store-products/sp-1', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    calls++;
    const body = route.request().postDataJSON();
    return route.fulfill({ status: body.confirmDiscontinue ? 200 : 409, json: body.confirmDiscontinue ? storeProduct : {
      code: 'STOCK_REMAINS_CONFIRMATION_REQUIRED', message: 'Stock remains.', stock: [{ locationId: store.id, locationName: store.name, quantity: '5.5' }],
    } });
  });
  await page.goto('/products/store-settings');
  await english(page);
  await page.getByRole('button', { name: new RegExp(`Edit ${product.name}`) }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name="isActive"]').selectOption('false');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('5.5');
  await expect(dialog.getByRole('alert')).toContainText('physical stock');
  expect(calls).toBe(1);
  await dialog.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(calls).toBe(2);
});

for (const width of [375, 1440]) {
  test(`Product assignment form at ${width}px supports All Stores and has no horizontal overflow`, async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/products');
    await english(page);
    await page.getByRole('button', { name: 'Add product', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('checkbox', { name: 'All Stores', exact: true }).check();
    await expect(dialog.getByText(/automatically assigns products/)).toBeVisible();
    await expect(dialog.locator('.product-store-options')).toHaveCount(0);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `../.test-artifacts/product-upgrade/form-${width}.png`, fullPage: true });
  });
}

test('A missing static product image leaves a blank area without a broken image', async ({ page }) => {
  await mockApi(page);
  await page.route('**/products?**', async (route) => route.fulfill({ json: { items: [{ ...product, imagePath: '/assets/products/missing.jpg' }], total: 1, page: 1, pageSize: 20 } }));
  await page.goto('/products');
  await expect(page.locator('.admin-table .product-image')).toBeEmpty();
  await expect(page.locator('.admin-table .product-image img')).toHaveCount(0);
});

test('Existing imageKey displays the original bundled asset and Admin can reuse the image library', async ({ page }) => {
  await mockApi(page);
  await page.route('**/products?**', async (route) => route.fulfill({ json: { items: [{ ...product, imageKey: 'milk' }], total: 1, page: 1, pageSize: 20 } }));
  await page.goto('/products');
  const image = page.locator('.admin-table .product-image img');
  await expect(image).toHaveAttribute('src', /\/assets\/products\/milk\.webp$/);
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  await english(page);
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Existing library image' }).selectOption('seafood');
  await expect(dialog.locator('.product-image img')).toHaveAttribute('src', /\/assets\/products\/seafood\.webp$/);
  await dialog.locator('[name="name"]').fill('A renamed product');
  await expect(dialog.locator('.product-image img')).toHaveAttribute('src', /\/assets\/products\/seafood\.webp$/);
});
