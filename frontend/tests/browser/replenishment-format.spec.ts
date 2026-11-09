import { test, expect, type Page } from '@playwright/test';
import { mockApi, product, store } from './fixtures';
import type { Recommendation } from '../../src/lib/decision';

const renderingErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  renderingErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(renderingErrors.get(page)).toEqual([]);
});

const sample: Recommendation = {
  id: 'recommendation-1',
  locationId: store.id,
  productId: product.id,
  demandForecastId: 'f-1',
  location: store,
  product,
  currentStockSnapshot: '0',
  incomingStockSnapshot: '0',
  safetyStockSnapshot: '5',
  recommendedQuantity: '108.4096',
  demandQuantitySnapshot: '103.4096',
  managerQuantity: null,
  decisionStatus: 'PENDING',
  decisionNote: null,
  decidedAt: null,
  dataSource: 'SYNTHETIC',
  purchaseOrder: null,
  expectedPurchaseQuantity: '109',
  expectedBaseQuantity: '109',
  forecast: {
    predictedQuantity: '103.4096',
    periodStart: '2026-09-27',
    periodEnd: '2026-10-26',
    createdAt: '2026-09-26T00:00:00Z',
    run: { modelVersion: 'test-model' },
  },
};

for (const locale of ['vi', 'en']) {
  test(`replenishment compact summary keeps exact review and decision values: ${locale}`, async ({
    page,
  }) => {
    const records = [
      sample,
      {
        ...sample,
        id: 'approved',
        decisionStatus: 'ADJUSTED' as const,
        managerQuantity: '705.2748',
        product: { ...product, baseUnit: { code: 'CAN', symbol: 'lon', allowFraction: false } },
        currentStockSnapshot: '12.3456',
        incomingStockSnapshot: '10.1234',
        safetyStockSnapshot: '5.25',
      },
    ];
    const api = await mockApi(page, { recommendations: records });
    await page.goto('/replenishment');
    if (locale === 'en') await page.getByRole('button', { name: 'English', exact: true }).click();
    const cards = page.locator('.planning-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.first().locator('.planning-quantity strong')).toHaveText('≈ 108 kg');
    await expect(cards.first().locator('.planning-metrics')).toContainText('≈ 103 kg');
    await expect(cards.first().locator('.planning-metrics')).toContainText('0 kg');
    await expect(cards.nth(1).locator('.planning-quantity strong')).toHaveText('≈ 705 lon');
    await expect(cards.nth(1).locator('.planning-metrics')).toContainText('≈ 12,3 lon');
    await expect(cards.nth(1).locator('.planning-metrics')).toContainText('≈ 5,3 lon');
    await expect(cards.nth(1).locator('.planning-reason')).toContainText('≈ 10,1 lon');
    await expect(page.locator('.decision-results')).not.toContainText(/108,4096|103,4096|705,2748/);
    await page.screenshot({
      path: `../.test-artifacts/i18n/replenishment-rounded-${locale}.png`,
      fullPage: true,
    });
    await cards
      .first()
      .getByRole('button', { name: locale === 'vi' ? 'Điều chỉnh' : 'Adjust', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.planning-quantity strong')).toHaveText('≈ 108 kg');
    await expect(dialog.locator('#adjust-quantity')).toHaveValue('108.4096');
    await expect(dialog.locator('form')).toContainText('108,4096 kg');
    await dialog.locator('.planning-calculation summary').click();
    await expect(dialog.locator('.decision-values')).toContainText('108,4096');
    await expect(dialog.locator('.decision-values')).toContainText('103,4096');
    await dialog.locator('#adjust-quantity').fill('123.4567');
    await dialog.locator('#decision-reason').fill('Test exact quantity');
    await dialog
      .getByRole('button', {
        name: locale === 'vi' ? 'Xác nhận quyết định' : 'Confirm decision',
        exact: true,
      })
      .click();
    await expect.poll(() => api.writes.length).toBe(1);
    expect(api.writes[0]).toEqual({
      path: '/replenishment/recommendation-1/decision',
      body: { decision: 'ADJUSTED', reason: 'Test exact quantity', managerQuantity: '123.4567' },
    });
    await expect(dialog.locator('.planning-quantity strong')).toHaveText('≈ 123 kg');
    expect(sample.recommendedQuantity).toBe('108.4096');
    expect(api.unknown).toEqual([]);
  });
}

test('replenishment handles zero, absent, malformed and tiny quantities on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Malformed API responses are intentionally exercised at the rendering boundary.
  const records = ['0', null, 'bad', '0.0001'].map((value, i) => ({
    ...sample,
    id: `edge-${i}`,
    recommendedQuantity: value,
    currentStockSnapshot: value,
    safetyStockSnapshot: value,
    demandQuantitySnapshot: value,
    forecast: { ...sample.forecast, predictedQuantity: value },
  })) as unknown as Recommendation[];
  const api = await mockApi(page, { recommendations: records });
  await page.goto('/replenishment');
  const cards = page.locator('.planning-card');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0).locator('.planning-quantity')).toContainText('Chưa cần nhập thêm');
  await expect(cards.nth(0).locator('.planning-quantity strong')).toHaveText('0 kg');
  for (const i of [1, 2]) {
    await expect(cards.nth(i).locator('.planning-quantity strong')).toHaveText('— kg');
    await expect(cards.nth(i).locator('.planning-quantity')).not.toContainText(
      'Chưa cần nhập thêm',
    );
    await expect(cards.nth(i).locator('.planning-reason')).toContainText('Chưa có số lượng hợp lệ');
    await expect(cards.nth(i).locator('.planning-metrics')).not.toContainText('≈ —');
  }
  await expect(cards.nth(3).locator('.planning-quantity strong')).toHaveText('< 1 kg');
  await expect(cards.nth(3).locator('.planning-metrics')).toContainText('< 0,1 kg');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(api.writes).toEqual([]);
  await page.screenshot({
    path: '../.test-artifacts/i18n/replenishment-rounded-mobile.png',
    fullPage: true,
  });
});
