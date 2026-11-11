import { test, expect, type Page } from '@playwright/test';
import { mockRollout } from './rollout-fixtures';

const views = [
  '/stores', '/users', '/inventory', '/purchases', '/sales/history', '/expenses', '/imports',
  '/forecasts', '/ai-center', '/replenishment', '/alerts', '/sales',
  '/login', '/forgot-password', '/reset-password?token=ui-test-token', '/missing-ui-page',
];
async function fit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) {
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const r = await dialog.boundingBox(), v = page.viewportSize()!;
    expect(r!.x).toBeGreaterThanOrEqual(0);
    expect(r!.y).toBeGreaterThanOrEqual(0);
    expect(r!.x + r!.width).toBeLessThanOrEqual(v.width + 1);
    expect(r!.y + r!.height).toBeLessThanOrEqual(v.height + 1);
  }
}
async function shot(page: Page, key: string) {
  await fit(page);
  await page.screenshot({ path: `../.test-artifacts/rollout-review/${key}.png`, fullPage: true, animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }' });
}

for (const width of [1440, 1280, 768, 375]) {
  for (const route of views) {
    test(`Rollout ${route} ${width}: VI/EN layout and read-only secondary views`, async ({ page }) => {
      const auth = ['/login', '/forgot-password', '/reset-password'].some(r => route.startsWith(r));
      const api = await mockRollout(page, { role: route === '/sales' ? 'STAFF' : 'ADMIN', authenticated: !auth });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 960 });
      await page.goto(route);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.locator('.admin-loading')).toHaveCount(0);
      await expect(page.locator(auth ? '.auth-screen' : '.workspace-design')).toBeVisible();
      for (const locale of ['vi', 'en']) {
        await page.getByRole('button', { name: locale === 'vi' ? 'Tiếng Việt' : 'English', exact: true }).first().click();
        await shot(page, `${route.split('?')[0].slice(1).replaceAll('/', '-')}-${locale}-${width}`);
      }
      const key = `${route.split('?')[0].slice(1).replaceAll('/', '-')}-en-${width}`;
      if (route === '/alerts') {
        await expect(page.locator('.alert-card.alert-high')).toHaveCSS('border-top-color', 'rgb(177, 59, 56)');
      }
      if (route.startsWith('/reset-password')) {
        await page.goto('/reset-password#token=' + 'a'.repeat(64));
        await expect(page.locator('#new-password')).toBeVisible();
        for (const locale of ['vi', 'en']) {
          await page.getByRole('button', { name: locale === 'vi' ? 'Tiếng Việt' : 'English', exact: true }).click();
          await shot(page, `reset-password-${locale}-${width}-form`);
        }
        await page.locator('.sign-in-button').click();
        await expect(page.locator('#new-password-error')).toBeVisible();
        await shot(page, `${key}-validation`);
      }
      if (['/stores', '/users', '/purchases', '/expenses'].includes(route)) {
        await page.locator('.page-heading > button').click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await shot(page, `${key}-create`);
        await page.getByRole('dialog').locator('.admin-form-actions').scrollIntoViewIfNeeded();
        await shot(page, `${key}-create-end`);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
      if (['/stores', '/users', '/expenses', '/inventory', '/purchases', '/sales/history'].includes(route)) {
        await page.locator('.admin-table tbody tr button').first().click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await shot(page, `${key}-detail-edit`);
        await page.keyboard.press('Escape');
      }
      if (['/stores', '/users'].includes(route)) {
        await page.locator('.admin-table tbody tr button').nth(1).click();
        await shot(page, `${key}-deactivate`);
        await page.keyboard.press('Escape');
      }
      if (route === '/imports') {
        await page.getByRole('button', { name: 'View results', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await shot(page, `${key}-results`);
        await page.keyboard.press('Escape');
        await page.locator('input[type=file]').first().setInputFiles({ name: 'review.csv', mimeType: 'text/csv', buffer: Buffer.from('sku,name\nTEST,Review') });
        await shot(page, `${key}-selected-file`);
      }
      if (route === '/replenishment') {
        await page.getByRole('button', { name: 'Adjust', exact: true }).first().click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.locator('.planning-calculation summary').click();
        await shot(page, `${key}-decision`);
        await page.keyboard.press('Escape');
      }
      if (route === '/sales') {
        await page.locator('.pos-product').first().click();
        await shot(page, `${key}-cart`);
        await page.locator('.checkout-button').click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await shot(page, `${key}-confirm`);
        await page.keyboard.press('Escape');
      }
      if (route === '/ai-center') {
        if (width === 375) expect((await page.locator('.ai-composer textarea').boundingBox())!.height).toBeGreaterThanOrEqual(72);
        await page.getByRole('switch', { name: 'Show the training workflow' }).check();
        await page.getByRole('combobox', { name: 'Training run', exact: true }).selectOption('job-1');
        await expect(page.locator('.ai-dashboard')).toBeVisible();
        await page.locator('summary').filter({ hasText: 'Detailed analysis' }).click();
        for (const analysis of ['calendar', 'density', 'errors', 'correlation', 'missing', 'importance']) {
          await page.getByRole('combobox', { name: 'Detailed analysis', exact: true }).selectOption(analysis);
          await shot(page, `${key}-${analysis}`);
        }
      }
      expect(errors).toEqual([]);
      expect(api.unknown).toEqual([]);
      expect(api.writes).toEqual([]);
    });
  }
}
