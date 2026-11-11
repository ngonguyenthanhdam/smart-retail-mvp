import { test, expect, type Page } from '@playwright/test';
import { mockRollout } from './rollout-fixtures';

async function capture(page: Page, key: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `../.test-artifacts/rollout-review/state-${key}.png`, fullPage: true, style: 'nextjs-portal { visibility: hidden; }' });
}
for (const width of [1440, 375]) {
  test(`Management loading/error/empty retry ${width}`, async ({ page }) => {
    const api = await mockRollout(page);
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    let fail = true;
    await page.route('**/locations?**', async route => {
      await wait;
      return route.fulfill({ status: fail ? 503 : 200, json: fail ? { message: 'Read unavailable' } : { items: [], total: 0, page: 1, pageSize: 20 } });
    });
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/stores');
    await expect(page.locator('.admin-loading')).toBeVisible();
    await capture(page, `loading-${width}`);
    release();
    await expect(page.locator('main [role=alert]')).toBeVisible();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await capture(page, `error-${width}`);
    fail = false;
    await page.locator('main [role=alert] button').click();
    await expect(page.locator('.empty-state')).toBeVisible();
    await capture(page, `empty-${width}`);
    expect(api.writes).toEqual([]);
  });

  test(`Auth loading, unavailable, validation and recovery ${width}`, async ({ page }) => {
    const api = await mockRollout(page, { authenticated: false });
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/auth/me', async route => { await wait; return route.fulfill({ status: 503, json: { message: 'Unavailable' } }); });
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/login');
    await expect(page.locator('.auth-status[role=status]')).toBeVisible();
    await capture(page, `auth-loading-${width}`);
    release();
    await expect(page.locator('.auth-status[role=alert]')).toBeVisible();
    await capture(page, `auth-error-${width}`);
    await page.unroute('**/auth/me');
    await page.locator('.auth-status button').click();
    await expect(page.locator('.login-card')).toBeVisible();
    await page.locator('.sign-in-button').click();
    await expect(page.locator('.field-error')).toHaveCount(2);
    await capture(page, `auth-validation-${width}`);
    expect(api.writes).toEqual([]);
  });

  test(`AI dataset creation, mapping, issues and chat options ${width}`, async ({ page }) => {
    const api = await mockRollout(page);
    const dataset = { id: 'data-review', name: 'Review dataset', status: 'STAGING', sourceKind: 'CSV', external: true, synthetic: true, locationId: null, revision: 1, summary: null, createdAt: '2026-11-08', expiresAt: '2026-12-08',
      files: [{ id: 'file-1', name: 'review-sales.csv', status: 'NEEDS_MAPPING', kind: 'SALES', bytes: 1024, rows: 1, mapping: {}, profile: { columns: ['product_id', 'unit_code'], ignoredColumns: [], sample: [{ row: 2, values: { product_id: 'COFFEE', unit_code: 'KG' } }], issueCount: 1 }, issues: [{ code: 'MISSING_REQUIRED_FIELDS', file: 'review-sales.csv', row: 2, column: 'product_id', reason: 'Mapping required', fix: 'Review columns' }] }] };
    await page.route('**/ai-center/datasets', route => route.fulfill({ json: { items: [dataset] } }));
    await page.route('**/ai-center/datasets/data-review', route => route.fulfill({ json: dataset }));
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/ai-center');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.locator('.ai-dataset-toolbar button').click();
    await expect(page.locator('.ai-data-management form')).toBeVisible();
    await capture(page, `ai-dataset-create-${width}`);
    await page.locator('.ai-dataset-toolbar select').selectOption('data-review');
    await expect(page.locator('.ai-file')).toBeVisible();
    for (const summary of await page.locator('.ai-file > details > summary').all()) await summary.click();
    await page.locator('.ai-file-options .ai-details > summary').click();
    await capture(page, `ai-mapping-${width}`);
    for (let i = 0; i < 4; i++) {
      await page.locator('.ai-tools-button').click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.getByRole('menuitem').nth(i).click();
      await expect(page.locator('.ai-chat-tool-panel')).toBeVisible();
      await capture(page, `ai-tools-${i}-${width}`);
    }
    expect(api.writes).toEqual([]);
    expect(api.unknown).toEqual([]);
  });
}
