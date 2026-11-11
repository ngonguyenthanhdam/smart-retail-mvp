import { test, expect } from '@playwright/test';
import { mockApi, product, store, category, account } from './fixtures';
import type { Page } from '@playwright/test';

const renderingErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  renderingErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(renderingErrors.get(page), 'No runtime, React or hydration errors').toEqual([]);
});

async function expectEnglishUi(page: Page) {
  await expect
    .poll(async () => {
      let text = await page.locator('body').innerText();
      for (const value of [
        product.name,
        store.name,
        category.name,
        account.fullName,
        store.city,
        store.district,
        store.address,
      ])
        text = text.replaceAll(value, 'USER_DATA');
      return text.match(/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệịỉĩọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹ]/gi) ?? [];
    })
    .toEqual([]);
}

test('default VI, instant switching, validation, auth, persistence and navigation', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApi(page, { authenticated: false });
  await page.goto('/login?next=products');
  await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Nhập mật khẩu.', { exact: true })).toBeVisible();
  await page.locator('#identifier').fill('test');
  await page.locator('#password').fill('unchanged-password');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Enter your password.', { exact: true })).toBeVisible();
  await expect(page.locator('#password')).toHaveValue('unchanged-password');
  expect(page.url()).toContain('/login?next=products');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
  await expect(page.getByText('1.000.000,25 VND', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect((await context.cookies()).find((c) => c.name === 'retailsense-locale')?.value).toBe('en');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
  expect(errors).toEqual([]);
});

const routes = [
  '/dashboard',
  '/products',
  '/products/categories',
  '/products/units',
  '/products/store-settings',
  '/inventory',
  '/stores',
  '/users',
  '/sales',
  '/purchases',
  '/expenses',
  '/imports',
  '/forecasts',
  '/replenishment',
  '/alerts',
  '/ai-center',
];
for (const route of routes)
  test(`${route}: VI/EN content, no rendering errors, same URL`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const api = await mockApi(page);
    await page.goto(route + '?i18n-test=1');
    await expect(page.locator('main h1').first()).toBeVisible();
    const url = page.url();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('main h1').first()).not.toContainText(
      /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệịỉĩọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹ]/i,
    );
    await expectEnglishUi(page);
    if (route === '/dashboard')
      await page.screenshot({ path: '../.test-artifacts/i18n/dashboard-en.png', fullPage: true });
    expect(page.url()).toBe(url);
    await page.getByRole('button', { name: 'Tiếng Việt', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    expect(errors).toEqual([]);
    expect(api.unknown).toEqual([]);
    expect(api.writes).toEqual([]);
  });

test('AI results and every analysis chart keep raw unit selection and display kg', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApi(page);
  await page.goto('/ai-center');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('switch', { name: 'Show the training workflow' }).check();
  await page.getByRole('combobox', { name: 'Training run', exact: true }).selectOption('job-1');
  await expect(page.getByRole('combobox', { name: 'Chart unit', exact: true })).toHaveValue('KG');
  await expect(page.getByRole('combobox', { name: 'Chart unit', exact: true })).toContainText('kg');
  await page.locator('summary').filter({ hasText: 'Detailed analysis' }).click();
  for (const view of ['calendar', 'density', 'errors', 'correlation', 'missing', 'importance']) {
    await page.getByRole('combobox', { name: 'Detailed analysis', exact: true }).selectOption(view);
    if (view === 'calendar') await expect(page.getByText('Mon', { exact: true })).toBeVisible();
    await expectEnglishUi(page);
  }
  await page.getByRole('button', { name: 'Tiếng Việt', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Đơn vị biểu đồ', exact: true })).toHaveValue(
    'KG',
  );
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Detailed analysis', exact: true })).toHaveValue(
    'importance',
  );
  await page.screenshot({ path: '../.test-artifacts/i18n/ai-results-en.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('purchase and expense drafts retain original numeric values and notes', async ({ page }) => {
  const api = await mockApi(page);
  await page.goto('/purchases');
  await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.locator('select[name="locationId"]').selectOption(store.id);
  await dialog.locator('#purchase-product-0').selectOption(product.id);
  await dialog.locator('#purchase-quantity-0').fill('1.5');
  await dialog.locator('#purchase-cost-0').fill('10000.5');
  await dialog.locator('[name="note"]').fill('Ghi chú chưa lưu');
  await dialog.getByRole('button', { name: 'English', exact: true }).click();
  await expect(dialog.locator('#purchase-quantity-0')).toHaveValue('1.5');
  await expect(dialog.getByText(/15\.000,75 VND/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0].body).toMatchObject({
    locationId: store.id,
    note: 'Ghi chú chưa lưu',
    items: [{ productId: product.id, purchaseQuantity: '1.5', unitCost: '10000.5' }],
  });
  await page.goto('/expenses');
  await page.getByRole('button', { name: 'New expense', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('[name="amount"]').fill('10000.25');
  await dialog.locator('[name="description"]').fill('Nội dung người dùng');
  await dialog.getByRole('button', { name: 'Tiếng Việt', exact: true }).click();
  await expect(dialog.locator('[name="amount"]')).toHaveValue('10000.25');
  await dialog.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(2);
  expect(api.writes[1].body).toMatchObject({
    amount: '10000.25',
    description: 'Nội dung người dùng',
  });
});

test('inventory lot dialog shows the same quantity and unit in both languages', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/inventory');
  await page.getByRole('button', { name: /Xem lô: / }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('500 kg', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'English', exact: true }).click();
  await expect(dialog.getByText('500 kg', { exact: true })).toBeVisible();
  await expect(dialog.getByText('5.000,25 VND', { exact: true })).toBeVisible();
});

test('password recovery and reset validation respond to locale', async ({ page }) => {
  await mockApi(page, { authenticated: false });
  await page.goto('/forgot-password');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('test@example.test');
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  await expect(page.getByText(/If an account with that email exists/)).toBeVisible();
  await page.goto('/reset-password#token=' + 'a'.repeat(64));
  await page.locator('#new-password').fill('password123');
  await page.locator('#confirm-password').fill('different123');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByText('The passwords do not match.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tiếng Việt', exact: true }).click();
  await expect(page.getByText('Hai mật khẩu chưa khớp.', { exact: true })).toBeVisible();
  await expect(page.locator('#new-password')).toHaveValue('password123');
});

test('product form keeps user text and category when switching inside a modal', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/products');
  await expect(page.getByRole('rowheader', { name: new RegExp(product.name) })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="name"]').fill('Tên nhập chưa lưu');
  await dialog.locator('input[name="sku"]').fill('KEEP-123');
  await dialog.locator('select[name="categoryId"]').selectOption(category.id);
  await dialog.getByRole('button', { name: 'English', exact: true }).click();
  await expect(dialog.locator('input[name="name"]')).toHaveValue('Tên nhập chưa lưu');
  await expect(dialog.locator('input[name="sku"]')).toHaveValue('KEEP-123');
  await expect(dialog.locator('select[name="categoryId"]')).toHaveValue(category.id);
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Add product');
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveCount(5);
  await page.screenshot({ path: '../.test-artifacts/i18n/product-modal-en.png', fullPage: true });
});

test('not-found content switches without navigation', async ({ page }) => {
  await mockApi(page);
  await page.goto('/missing-i18n-page');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
  const url = page.url();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  expect(page.url()).toBe(url);
  await page.goto('/missing/nested-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('inventory filters and store selection survive locale changes', async ({ page }) => {
  await mockApi(page);
  await page.goto('/inventory');
  await page.locator('select[name="locationId"]').selectOption(store.id);
  await page.locator('#inventory-search').fill('Cà phê');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('select[name="locationId"]')).toHaveValue(store.id);
  await expect(page.locator('#inventory-search')).toHaveValue('Cà phê');
});

test('forecast quantities, revenue and daily chart use product metadata in VI and EN', async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto('/forecasts');
  await expect(page.locator('#forecast-run')).toHaveValue('forecast-1');
  await expect(page.locator('.forecast-results-table tbody tr').first()).toContainText(
    '15.001 VND',
  );
  await expect(
    page.locator('.forecast-results-table').getByText('2 kg', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('#forecast-run')).toHaveValue('forecast-1');
  await expect(page.locator('.demand-chart-readout')).toContainText('1,5 kg');
  await page.getByText('View daily figures', { exact: true }).click();
  await expectEnglishUi(page);
  expect(api.unknown).toEqual([]);
  expect(api.writes).toEqual([]);
});

test('sales cart and quantities survive locale changes with the same request values', async ({
  page,
}) => {
  const api = await mockApi(page, { role: 'STAFF' });
  await page.goto('/sales');
  await page.getByRole('button', { name: /Thêm Cà phê nguyên chất/ }).click();
  const quantity = page.getByRole('spinbutton', { name: 'Số lượng Cà phê nguyên chất' });
  await quantity.fill('1.5');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Quantity for Cà phê nguyên chất' }),
  ).toHaveValue('1.5');
  await expect(page.getByText('15.000,75 VND', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Complete sale', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm sale', exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0].body).toMatchObject({
    locationId: 'store-1',
    items: [{ productId: product.id, quantity: '1.5' }],
    expectedTotal: '15000.75',
  });
});

for (const width of [390, 768, 1440])
  test(`responsive ${width}: switch, tables and keyboard`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.goto('/inventory');
    await expect(page.getByText('500 kg', { exact: true })).toBeVisible();
    const button = page.getByRole('button', { name: 'English', exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: `../.test-artifacts/i18n/inventory-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });

for (const role of ['STAFF', 'STORE_MANAGER'])
  test(`${role}: locale preserves role guards and selected store`, async ({ page }) => {
    await mockApi(page, { role });
    await page.goto('/sales');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.getByText('Cửa hàng thử nghiệm', { exact: true }).first()).toBeVisible();
    await expect(page.locator('nav a[href="/users"]')).toHaveCount(0);
    await page.goto('/users');
    await expect(page).not.toHaveURL(/users$/);
  });
