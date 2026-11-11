// Isolated visual scenarios. Never imported by application source.
import type { Page } from '@playwright/test';
import { mockApi, store, product, account } from './fixtures';
import type { Recommendation } from '../../src/lib/decision';

export const recommendation: Recommendation = {
  id: 'review-1', locationId: store.id, productId: product.id, demandForecastId: 'forecast-1',
  location: store, product, currentStockSnapshot: '2', incomingStockSnapshot: '0', safetyStockSnapshot: '5',
  recommendedQuantity: '108.4096', demandQuantitySnapshot: '105.4096', managerQuantity: null,
  decisionStatus: 'PENDING', decisionNote: null, decidedAt: null, dataSource: 'REAL', purchaseOrder: null,
  expectedPurchaseQuantity: '108.4096', expectedBaseQuantity: '108.4096',
  forecast: { predictedQuantity: '105.4096', periodStart: '2026-11-01', periodEnd: '2026-11-30', createdAt: '2026-11-01T00:00:00Z', run: { modelVersion: 'test-model' } },
};
const purchase = { id: 'purchase-1', orderNumber: 'PO-001', locationId: store.id, location: store,
  status: 'DRAFT', orderedAt: '2026-11-08', receivedAt: null, totalCost: '7500.375', note: 'Review draft', creator: account,
  replenishmentRecommendationId: null, importJobId: null,
  items: [{ id: 'line-1', productId: product.id, product, purchaseQuantity: '1.5', baseQuantity: '1.5', unitCost: '5000.25', lineTotal: '7500.375', lotNumber: null, expiryDate: null }],
};
const sale = { id: 'sale-1', invoiceNumber: 'SALE-001', locationId: store.id, location: store,
  status: 'COMPLETED', soldAt: '2026-11-08', subtotal: '15000.75', discountAmount: '0', totalAmount: '15000.75', creator: account, importJobId: null,
  items: [{ id: 'line-1', productId: product.id, product, quantity: '1.5', unitPrice: '10000.50', discountAmount: '0', lineTotal: '15000.75', costOfGoodsSold: '7500.375' }],
};
const expense = { id: 'expense-1', locationId: store.id, location: store, expenseType: 'RENT', amount: '5000000', expenseDate: '2026-11-08', description: 'Store rent', creator: account };
const importJob = { id: 'import-1', importType: 'PRODUCT', fileName: 'catalog-review.csv', status: 'FAILED', totalRows: 2, successRows: 0, failedRows: 2, createdAt: '2026-11-08', errorReport: [{ row: 2, error: 'Missing SKU' }], columns: ['sku', 'name'], validRows: 0, invalidRows: 2, previewAvailable: false };
const alert = { id: 'alert-1', alertType: 'STOCKOUT_RISK', severity: 'HIGH', status: 'OPEN', message: 'Low stock', detectedAt: '2026-11-08', resolvedAt: null, locationId: store.id, productId: product.id, demandForecastId: 'forecast-1', location: store, product, lot: null };

export async function mockRollout(page: Page, options: { role?: string; authenticated?: boolean } = {}) {
  const api = await mockApi(page, { ...options, recommendations: [recommendation] });
  const employee = { ...account, id: 'employee-2', fullName: 'Nhân viên cửa hàng', role: 'STAFF', locationId: store.id, location: store };
  const records: Record<string, unknown> = { '/users': employee, '/purchases': purchase, '/sales': sale, '/expenses': expense, '/imports': importJob, '/alerts': alert };
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    // Only override the existing isolated API fixtures, never Next's page requests.
    if (url.port !== '3001' || request.method() !== 'GET') return route.fallback();
    if (url.pathname === '/users/user-1') return route.fulfill({ json: { ...account, role: 'STAFF', locationId: store.id, location: store } });
    const record = records[url.pathname];
    if (record) return route.fulfill({ json: { items: [record], total: 1, page: 1, pageSize: 20, summary: {} } });
    for (const [endpoint, value] of Object.entries(records)) {
      if (url.pathname === `${endpoint}/${(value as { id: string }).id}`) return route.fulfill({ json: value });
    }
    return route.fallback();
  });
  return api;
}
