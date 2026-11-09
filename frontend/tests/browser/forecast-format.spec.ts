import { test, expect } from '@playwright/test';
import { mockApi, forecast, product } from './fixtures';

for (const locale of ['vi', 'en'])
  test(`forecast rounded labels and original data: ${locale}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const sample = structuredClone(forecast);
    sample.forecasts[0] = {
      ...sample.forecasts[0],
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      predictedQuantity: '188.2143',
      estimatedUnitPrice: '7500.25',
      predictedRevenue: '1411607.25',
    };
    sample.dailySeries[0].daily = [
      { date: '2026-02-01', quantity: 6.071429 },
      { date: '2026-02-02', quantity: 9.99999 },
    ];
    const original = structuredClone(sample);
    const api = await mockApi(page, { forecastResult: sample });
    await page.goto('/forecasts');
    if (locale === 'en') await page.getByRole('button', { name: 'English', exact: true }).click();
    const row = page.locator('.forecast-results-table tbody tr').first();
    await expect(row).toContainText(product.name);
    await expect(row).toContainText('188 kg');
    await expect(row).toContainText('6,1 kg/');
    await expect(row.locator('td').nth(2)).toHaveText('7.500 VND');
    await expect(row.locator('td').last()).toContainText('1.411.607 VND');
    await expect(page.locator('.forecast-months')).toContainText('1.411.607 VND');
    await expect(page.locator('.demand-chart-readout')).toContainText('6,1 kg');
    await expect(page.locator('.demand-chart-slider')).toHaveAttribute('aria-valuetext', /6,1 kg/);
    await page.locator('.demand-chart-data summary').click();
    await expect(page.locator('.demand-chart-data tbody')).toContainText('6,1 kg');
    await expect(page.locator('.demand-chart-data tbody')).toContainText('10 kg');
    await expect(page.locator('main')).not.toContainText(
      /188,2143|6,071429|1\.411\.607,25|9,99999/,
    );
    // The chart uses the unrounded daily values; rounding only affects text labels.
    const chart = page.locator('.demand-chart-canvas svg');
    const pointY = Number(await chart.locator('circle').getAttribute('cy'));
    expect(pointY).toBeCloseTo(190 - (6.071429 * 155) / 9.99999, 5);
    expect(sample).toEqual(original);
    expect(api.writes).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `../.test-artifacts/i18n/forecast-rounded-${locale}.png`,
      fullPage: true,
    });
  });

test('forecast zero, missing and invalid values display safely across units', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const base = forecast.forecasts[0];
  const result = {
    ...forecast,
    forecasts: [
      {
        ...base,
        predictedQuantity: '0',
        estimatedUnitPrice: '0',
        predictedRevenue: '0',
        product: {
          ...product,
          baseUnit: { code: 'CAN', name: 'lon', symbol: 'lon', allowFraction: false },
        },
      },
      {
        ...base,
        id: 'missing',
        productId: 'missing',
        predictedQuantity: null,
        estimatedUnitPrice: null,
        predictedRevenue: null,
        product: { ...product, id: 'missing', baseUnit: null },
      },
      {
        ...base,
        id: 'invalid',
        productId: 'invalid',
        predictedQuantity: 'bad',
        estimatedUnitPrice: 'bad',
        predictedRevenue: 'bad',
        product: {
          ...product,
          id: 'invalid',
          baseUnit: { code: 'G', name: 'Gram', symbol: 'g', allowFraction: true },
        },
      },
    ],
    dailySeries: [
      {
        ...forecast.dailySeries[0],
        history: [],
        daily: [
          { date: '2026-11-01', quantity: null },
          { date: '2026-11-02', quantity: 0 },
          { date: '2026-11-03', quantity: 'bad' },
        ],
      },
    ],
  };
  const api = await mockApi(page, { forecastResult: result });
  await page.goto('/forecasts');
  const rows = page.locator('.forecast-results-table tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('0 lon');
  await expect(rows.nth(0)).toContainText('0 VND');
  for (const index of [1, 2]) {
    await expect(rows.nth(index)).toContainText('—');
    await expect(rows.nth(index)).not.toContainText('0 VND');
  }
  await expect(page.locator('.forecast-months')).toContainText('—');
  await expect(page.locator('.demand-chart-readout')).toContainText('— lon');
  await expect(page.locator('.demand-chart-canvas circle')).toHaveCount(0);
  await page.locator('.demand-chart-data summary').click();
  await expect(page.locator('.demand-chart-data tbody')).toContainText('0 lon');
  expect(errors).toEqual([]);
  expect(api.writes).toEqual([]);
});
