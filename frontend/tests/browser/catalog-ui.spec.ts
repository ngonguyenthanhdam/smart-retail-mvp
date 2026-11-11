import { test, expect, type Page } from '@playwright/test';
import { mockApi, product, category, unit, storeProduct } from './fixtures';

const screens = [
  { route: '/products', endpoint: '/products', record: product },
  { route: '/products/categories', endpoint: '/categories', record: category },
  { route: '/products/units', endpoint: '/units', record: unit },
  { route: '/products/store-settings', endpoint: '/store-products', record: storeProduct },
];

async function english(page: Page) {
  await page.getByRole('button', { name: 'English', exact: true }).first().click();
}

for (const width of [1440, 1280, 768, 375]) {
  for (const { route } of screens) {
    test(`${route}: list and native form fit ${width}px in VI/EN`, async ({ page }) => {
      const api = await mockApi(page);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page.locator('.admin-table tbody tr')).toHaveCount(1);
      for (const locale of ['vi', 'en']) {
        await page.getByRole('button', { name: locale === 'vi' ? 'Tiếng Việt' : 'English', exact: true }).first().click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const table = page.locator('.admin-table-scroll');
        await table.focus();
        await expect(table).toBeFocused();
        if (width === 375) {
          await page.keyboard.press('ArrowRight');
          await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
        }
        const opener = page.locator('.page-heading > button');
        await opener.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.locator('.catalog-form-hint')).toHaveText(locale === 'vi' ? 'Các trường có dấu * là bắt buộc.' : 'Fields marked * are required.');
        expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        const box = await dialog.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(901);
        const label = dialog.locator('.form-field label').first();
        expect(await label.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
        await dialog.locator('input[required]').first().focus().catch(() => dialog.locator('select[required]').first().focus());
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
        if (width === 375 || width === 1440) {
          await dialog.evaluate(el => { el.scrollTop = 0; });
          await page.screenshot({ path: `../.test-artifacts/catalog-review/form-${route.slice(1).replaceAll('/', '-')}-${locale}-${width}.png`, style: 'nextjs-portal { visibility: hidden; }' });
          await dialog.locator('.admin-form-actions').scrollIntoViewIfNeeded();
          await page.screenshot({ path: `../.test-artifacts/catalog-review/form-end-${route.slice(1).replaceAll('/', '-')}-${locale}-${width}.png`, style: 'nextjs-portal { visibility: hidden; }' });
        }
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
      }
      expect(api.writes).toEqual([]);
      expect(api.unknown).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test('Catalog mobile filters preserve query and pagination; grid preserves product data', async ({ page }) => {
  const api = await mockApi(page);
  const requests: URL[] = [];
  await page.route('**/products?**', async route => {
    const url = new URL(route.request().url());
    requests.push(url);
    await route.fulfill({ json: { items: [product], total: 41, page: Number(url.searchParams.get('page')), pageSize: 20 } });
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/products');
  await english(page);
  const toggle = page.getByRole('button', { name: 'Filters', exact: true });
  await toggle.click();
  await page.locator('#products-search').fill('coffee');
  await page.locator('#products-category').selectOption(category.id);
  await page.locator('#products-status').selectOption('inactive');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect.poll(() => requests.at(-1)?.searchParams.get('search')).toBe('coffee');
  expect(requests.at(-1)?.searchParams.get('categoryId')).toBe(category.id);
  expect(requests.at(-1)?.searchParams.get('status')).toBe('inactive');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('page')).toBe('2');
  expect(requests.at(-1)?.searchParams.get('search')).toBe('coffee');
  await page.getByRole('button', { name: 'Images', exact: true }).click();
  await expect(page.locator('.catalog-product-card h2')).toHaveText(product.name);
  await expect(page.locator('.catalog-product-card')).toContainText(product.sku);
  await page.screenshot({ path: '../.test-artifacts/catalog-review/grid-mobile-en.png', fullPage: true });
  expect(api.writes).toEqual([]);
});

for (const { route, endpoint, record } of screens) {
  test(`${route}: loading, failed read/retry, empty and inactive states`, async ({ page }) => {
    const api = await mockApi(page);
    let state: 'error' | 'empty' | 'record' = 'error';
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${endpoint}?**`, async request => {
      await gate;
      if (state === 'error') return request.fulfill({ status: 500, json: { message: 'Request failed' } });
      const items = state === 'empty' ? [] : [{ ...record, isActive: false }];
      return request.fulfill({ json: { items, total: items.length, page: 1, pageSize: 20 } });
    });
    await page.goto(route);
    await english(page);
    await expect(page.locator('.admin-loading')).toBeVisible();
    release();
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    state = 'empty';
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No records found' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    state = 'record';
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(1);
    if (endpoint !== '/units') await expect(page.locator('.record-status.is-inactive')).toBeVisible();
    expect(api.writes).toEqual([]);
  });
}

test('Category create validation and deactivate confirmation keep payloads and focus', async ({ page }) => {
  const api = await mockApi(page);
  await page.goto('/products/categories');
  await english(page);
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect(api.writes).toHaveLength(0);
  await expect(dialog.locator('#category-code')).toBeFocused();
  await dialog.locator('#category-code').fill('NEW');
  await dialog.locator('#category-name').fill('New category');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.writes[0]).toEqual({ path: '/categories', body: { code: 'NEW', name: 'New category', parentId: null, isActive: true } });
  await expect(page.getByRole('status')).toContainText('Changes saved.');
  await page.getByRole('button', { name: `Edit ${category.name}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('#category-status').selectOption('false');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Deactivate category?' })).toBeVisible();
  expect(api.writes).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(dialog.locator('#category-status')).toHaveValue('false');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await dialog.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.writes[1]).toEqual({ path: `/categories/${category.id}`, body: { code: category.code, name: category.name, parentId: null, isActive: false } });
});

test('Unit edit retains symbol, fraction flag and draft across VI/EN', async ({ page }) => {
  const api = await mockApi(page);
  await page.goto('/products/units');
  await english(page);
  await page.getByRole('button', { name: `Edit ${unit.name}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#unit-symbol').fill('kg');
  await dialog.locator('[name="allowFraction"]').check();
  await dialog.getByRole('button', { name: 'Tiếng Việt', exact: true }).click();
  await expect(dialog.locator('#unit-symbol')).toHaveValue('kg');
  await expect(dialog.locator('[name="allowFraction"]')).toBeChecked();
  await dialog.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.writes[0]).toEqual({ path: `/units/${unit.id}`, body: { code: unit.code, name: unit.name, symbol: 'kg', allowFraction: true } });
});

for (const role of ['STORE_MANAGER', 'STAFF']) {
  test(`${role} catalog rights and denied master routes remain unchanged`, async ({ page }) => {
    const api = await mockApi(page, { role });
    await page.goto('/products');
    await english(page);
    await expect(page.locator('.catalog-nav a')).toHaveCount(1);
    await expect(page.locator('.page-heading > button')).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Edit ${product.name}`, exact: true })).toHaveCount(role === 'STAFF' ? 0 : 1);
    for (const denied of ['/products/categories', '/products/units']) {
      await page.goto(denied);
      await expect(page).toHaveURL(new RegExp(`${role === 'STAFF' ? '/sales' : '/dashboard'}$`));
    }
    expect(api.writes).toEqual([]);
  });
}
