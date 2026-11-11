import { test, expect, type Page } from '@playwright/test';
import { mockApi, store } from './fixtures';

// Existing in-memory fixtures only. mockApi blocks all real backend traffic.
// Screenshots from this suite are layout evidence, not live-business-data evidence.
async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [1672, 1440, 1024, 768, 390, 375]) {
  test(`Dashboard preview ${width}: exact values, locale, responsive and keyboard`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const api = await mockApi(page);
    await page.setViewportSize({ width, height: 941 });
    await page.goto('/dashboard');
    await expect(page.locator('[data-dashboard-metrics] > section')).toHaveCount(4);
    await expect(page.locator('[data-dashboard-metrics]')).toContainText('1.000.000,25 VND');
    await expect(page.locator('[data-dashboard-metrics]')).toContainText('300.000,25 VND');
    await noPageOverflow(page);
    await page.screenshot({
      path: `../.test-artifacts/dashboard-review/fixture-vi-${width}.png`,
      fullPage: true,
      style: 'nextjs-portal { visibility: hidden; }',
    });
    if (width === 1672) {
      await page.screenshot({
        path: '../.test-artifacts/dashboard-review/fixture-vi-desktop-viewport.png',
        style: 'nextjs-portal { visibility: hidden; }',
      });
    }

    const slider = page.getByRole('slider');
    await slider.focus();
    await slider.press('Home');
    await expect(slider).toHaveAttribute('aria-valuetext', '07/11/2026: 500.000 VND');
    await slider.press('End');
    await expect(slider).toHaveAttribute('aria-valuetext', '08/11/2026: 500.000,25 VND');
    await page.getByText('Xem số liệu từng ngày', { exact: true }).click();
    await expect(page.getByRole('region', { name: 'Xem số liệu từng ngày' })).toContainText('500.000,25 VND');

    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Business Dashboard' })).toBeVisible();
    await expect(page.locator('[data-dashboard-metrics]')).toContainText('1.000.000,25 VND');
    await noPageOverflow(page);
    await page.getByText('View daily values', { exact: true }).click();
    await page.screenshot({
      path: `../.test-artifacts/dashboard-review/fixture-en-${width}.png`,
      fullPage: true,
      style: 'nextjs-portal { visibility: hidden; }',
    });
    expect(errors).toEqual([]);
    expect(api.writes).toEqual([]);
    expect(api.unknown).toEqual([]);
  });
}

test('Dashboard draft/apply, validation, refresh and mobile focus retain read-only requests', async ({ page }) => {
  const api = await mockApi(page);
  const reports: URL[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/reports/dashboard') reports.push(new URL(request.url()));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await expect(page.locator('[data-dashboard-metrics]')).toBeVisible();
  const filterToggle = page.getByRole('button', { name: 'Bộ lọc báo cáo' });
  await filterToggle.click();
  const count = reports.length;
  await page.locator('#report-period').selectOption('7');
  await page.locator('#report-from').fill('2026-10-15');
  await page.locator('#report-to').fill('2026-10-20');
  await page.locator('#report-store').selectOption(store.id);
  await expect(page.getByText('Bộ lọc chưa áp dụng')).toBeVisible();
  expect(reports.length).toBe(count);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('#report-from')).toHaveValue('2026-10-15');
  await expect(page.locator('#report-store')).toHaveValue(store.id);
  await page.locator('#report-to').fill('2026-10-01');
  expect(await page.locator('#report-to').evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);
  await page.locator('#report-to').fill('2026-10-20');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Report filters' })).toBeFocused();
  await expect.poll(() => reports.at(-1)?.searchParams.get('locationId')).toBe(store.id);
  expect(reports.at(-1)?.searchParams.get('from')).toBe('2026-10-15');
  expect(reports.at(-1)?.searchParams.get('to')).toBe('2026-10-20');
  await expect(page.locator('[data-dashboard-metrics]')).toBeVisible();
  const applied = reports.length;
  await page.getByRole('button', { name: 'Refresh reports' }).click();
  await expect.poll(() => reports.length).toBeGreaterThan(applied);
  expect(api.writes).toEqual([]);
});

test('Dashboard preview is scoped; manager and staff guards remain unchanged', async ({ page }) => {
  const api = await mockApi(page, { role: 'STORE_MANAGER' });
  await page.goto('/dashboard');
  await expect(page.locator('[data-dashboard-metrics]')).toBeVisible();
  await expect(page.locator('#report-store')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'So sánh cửa hàng' })).toHaveCount(0);
  await expect(page.locator('.dashboard-preview')).toHaveCount(1);
  await page.goto('/inventory');
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('.dashboard-preview')).toHaveCount(0);
  expect(api.writes).toEqual([]);
  await mockApi(page, { role: 'STAFF' });
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/sales$/);
  await expect(page.locator('[data-dashboard-metrics]')).toHaveCount(0);
});

test('Dashboard report failure stays explicit and retry restores the same report', async ({ page }) => {
  const api = await mockApi(page);
  let fail = true;
  await page.route('**/reports/dashboard?**', route => fail
    ? route.fulfill({ status: 503, json: { message: 'Service unavailable' } })
    : route.fallback());
  await page.goto('/dashboard');
  await expect(page.locator('main').getByRole('alert')).toContainText('Chưa tải được báo cáo');
  await expect(page.locator('[data-dashboard-metrics]')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.locator('[data-dashboard-metrics]')).toContainText('1.000.000,25 VND');
  expect(api.writes).toEqual([]);
});

test('Dashboard keyboard navigation, zoom reflow and short landscape remain usable', async ({ page }) => {
  const api = await mockApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 736, height: 390 });
  await page.goto('/dashboard');
  await expect(page.locator('[data-dashboard-metrics]')).toBeVisible();
  await page.locator('.brand-link').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: 'Đến nội dung chính' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.getByRole('button', { name: 'Mở hoặc đóng menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
  await page.getByRole('link', { name: 'Cảnh báo tồn kho', exact: true }).first().focus();
  await expect(page.getByRole('link', { name: 'Cảnh báo tồn kho', exact: true }).first()).toBeInViewport();
  await page.getByRole('button', { name: 'Mở hoặc đóng menu' }).click();
  await noPageOverflow(page);

  // 1440×940 at 200% browser zoom has a 720×470 CSS-pixel layout viewport.
  // Check that reflow without modifying source styles or business data.
  await page.setViewportSize({ width: 720, height: 470 });
  await noPageOverflow(page);
  await expect(page.getByRole('heading', { name: 'Tổng quan kinh doanh' })).toBeVisible();
  expect(api.writes).toEqual([]);
  expect(api.unknown).toEqual([]);
});
