import type { Page, Route } from '@playwright/test';
import type { Recommendation } from '../../src/lib/decision';

export const store = {
  id: 'store-1',
  code: 'TEST',
  name: 'Cửa hàng thử nghiệm',
  locationType: 'STORE',
  address: 'Địa chỉ thử',
  district: 'Quận 1',
  city: 'Hồ Chí Minh',
  isActive: true,
};
export const unit = {
  id: 'unit-kg',
  code: 'KG',
  name: 'Kilogram',
  symbol: 'KG',
  allowFraction: true,
};
export const category = {
  id: 'category-1',
  code: 'COFFEE',
  name: 'Danh mục người dùng',
  isActive: true,
  parentId: null,
  parent: null,
};
export const product = {
  id: 'product-1',
  sku: 'COFFEE',
  barcode: '123456789',
  name: 'Cà phê nguyên chất',
  categoryId: category.id,
  category,
  baseUnitId: unit.id,
  baseUnit: unit,
  purchaseUnitId: unit.id,
  purchaseUnit: unit,
  purchaseToBaseRatio: '1',
  defaultCost: '5000.25',
  trackExpiry: false,
  shelfLifeDays: null,
  isActive: true,
};
export const storeProduct = {
  id: 'sp-1',
  locationId: store.id,
  location: store,
  productId: product.id,
  product,
  sellingPrice: '10000.50',
  safetyStock: '1.5',
  minStockLevel: '2',
  isActive: true,
};
export const inventory = {
  locationId: store.id,
  locationCode: store.code,
  locationName: store.name,
  locationType: 'STORE',
  productId: product.id,
  sku: product.sku,
  productName: product.name,
  categoryId: category.id,
  categoryName: category.name,
  baseUnitCode: 'KG',
  currentQuantity: '500',
  sellableQuantity: '500',
  sellingPrice: '10000.50',
  safetyStock: '1.5',
  minStockLevel: '2',
  lowStock: false,
  trackExpiry: false,
  earliestExpiry: null,
  expiryStatus: 'NOT_TRACKED',
};
export const account = {
  id: 'user-1',
  fullName: 'Người dùng thử nghiệm',
  username: 'test',
  email: 'test@example.test',
  role: 'ADMIN',
  locationId: null,
  location: null,
  isActive: true,
};
export const trainingResult = {
  metadata: { model_version: 'fixture-model', algorithm: 'LightGBM', contains_synthetic: true },
  evaluation: {
    protocol: {
      validation_origin: '2026-09-01',
      test_origin: '2026-10-01',
      test_end: '2026-10-31',
      horizons: [7, 30],
    },
    selection: { algorithm: 'LightGBM', scores: { LightGBM: 0.1 } },
    validation: {},
    test: {
      LightGBM: {
        '7': { by_unit: { KG: { daily: { mae: 1.25, rmse: 2.5, wape: 0.1, bias: 0.02 } } } },
        '30': { by_unit: { KG: { daily: { mae: 1.5, rmse: 3, wape: 0.15, bias: 0.03 } } } },
      },
    },
    diagnostics: {
      LightGBM: {
        samples: [
          {
            store_id: store.id,
            product_id: product.id,
            date: '2026-10-02',
            actual: 12.5,
            predicted: 13.25,
            unit: 'KG',
          },
          {
            store_id: store.id,
            product_id: product.id,
            date: '2026-10-03',
            actual: 14,
            predicted: 12,
            unit: 'KG',
          },
        ],
        by_unit_error: {},
      },
    },
    feature_importance: { lag_7: 5, rolling_mean_28: 3 },
  },
  eda: {
    rows: 150,
    pairs: 1,
    start: '2026-06-01',
    end: '2026-10-31',
    missing_values: 0,
    duplicates: 0,
    zero_days: 1,
    by_unit: {
      KG: {
        rows: 150,
        zero_days: 1,
        outliers_retained: 0,
        distribution: { counts: [1, 2], edges: [0, 10, 20] },
        daily: [
          { date: '2026-10-02', quantity: 12.5 },
          { date: '2026-10-03', quantity: 14 },
        ],
      },
    },
    feature_diagnostics: {
      train_end: '2026-09-01',
      by_unit: {
        KG: {
          labels: ['quantity', 'lag_7'],
          rows: 120,
          eligible_rows: 90,
          correlation: [
            [1, 0.5],
            [0.5, 1],
          ],
          missing: [{ from: '2026-06-01', to: '2026-07-01', rows: 30, percent: [0, 10] }],
        },
      },
    },
  },
};
const job = {
  id: 'job-1',
  datasetId: 'dataset-1',
  modelVersion: 'fixture-model',
  status: 'COMPLETED',
  createdAt: '2026-11-01T00:00:00Z',
  config: { evaluationDays: 30, algorithms: ['LightGBM'] },
  result: trainingResult,
};
const list = (items: unknown[]) => ({ items, page: 1, pageSize: 20, total: items.length });
export const forecast = {
  id: 'forecast-1',
  modelVersion: 'fixture-model',
  algorithm: 'LightGBM',
  horizonMonths: 1,
  status: 'COMPLETED',
  startedAt: '2026-11-01T00:00:00Z',
  completedAt: '2026-11-01T00:01:00Z',
  origin: '2026-11-01',
  usageMode: 'EXPERIMENTAL',
  realWorldAccuracyVerified: false,
  errorCode: null,
  forecastCount: 1,
  periodKind: 'CALENDAR_MONTH',
  dataSource: 'REAL',
  skipped: [],
  forecasts: [
    {
      id: 'forecast-item-1',
      locationId: store.id,
      productId: product.id,
      location: store,
      product,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      predictedQuantity: '1.5',
      estimatedUnitPrice: '10000.50',
      predictedRevenue: '15000.75',
      createdAt: '2026-11-01T00:01:00Z',
    },
  ],
  dailySeries: [
    {
      locationId: store.id,
      productId: product.id,
      dataSource: 'REAL',
      history: [{ date: '2026-10-31', quantity: 2 }],
      daily: [{ date: '2026-11-01', quantity: 1.5 }],
    },
  ],
};

export async function mockApi(
  page: Page,
  options: {
    authenticated?: boolean;
    role?: string;
    forecastResult?: unknown;
    recommendations?: Recommendation[];
  } = {},
) {
  let authenticated = options.authenticated ?? true;
  const role = options.role ?? 'ADMIN';
  const user = {
    ...account,
    role,
    locationId: role === 'ADMIN' ? null : store.id,
    location: role === 'ADMIN' ? null : store,
  };
  const writes: { path: string; body: unknown }[] = [];
  const unknown: string[] = [];
  const frontendOrigin = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT || '3000'}`;
  const reply = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      json: body,
      headers: {
        'Access-Control-Allow-Origin': frontendOrigin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
      },
    });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === frontendOrigin) return route.continue();
    // Never allow browser scenarios to reach a real backend or external service.
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
    const endpoint = url.pathname;
    if (route.request().method() === 'OPTIONS') return reply(route, {});
    if (endpoint === '/auth/me')
      return reply(route, authenticated ? user : {}, authenticated ? 200 : 401);
    if (endpoint === '/auth/login') {
      authenticated = true;
      return reply(route, user);
    }
    if (endpoint === '/auth/logout') {
      authenticated = false;
      return reply(route, {});
    }
    if (endpoint === '/auth/forgot-password' || endpoint === '/auth/reset-password')
      return reply(route, {});
    if (!['GET', 'HEAD'].includes(route.request().method())) {
      writes.push({ path: endpoint, body: route.request().postDataJSON() });
      const recommendation = options.recommendations?.find(
        (r) => endpoint === `/replenishment/${r.id}/decision`,
      );
      if (recommendation) {
        const body = route.request().postDataJSON();
        return reply(route, {
          ...recommendation,
          decisionStatus: body.decision,
          managerQuantity: body.managerQuantity ?? null,
        });
      }
      if (endpoint === '/sales')
        return reply(route, {
          id: 'saved',
          invoiceNumber: 'TEST-1',
          locationId: store.id,
          location: store,
          creator: user,
          status: 'COMPLETED',
          soldAt: '2026-11-09T00:00:00Z',
          subtotal: '15000.75',
          discountAmount: '0',
          totalAmount: '15000.75',
          importJobId: null,
          items: [
            {
              id: 'line-1',
              productId: product.id,
              product,
              quantity: '1.5',
              unitPrice: '10000.50',
              discountAmount: '0',
              lineTotal: '15000.75',
              costOfGoodsSold: '7500.375',
            },
          ],
        });
      return reply(route, { id: 'saved', ...route.request().postDataJSON() });
    }
    if (endpoint === '/locations') return reply(route, list([store]));
    if (endpoint === '/locations/' + store.id) return reply(route, store);
    if (endpoint === '/products') return reply(route, list([product]));
    if (endpoint === '/products/' + product.id) return reply(route, product);
    if (endpoint === '/categories') return reply(route, list([category]));
    if (endpoint === '/units') return reply(route, list([unit]));
    if (endpoint === '/store-products') return reply(route, list([storeProduct]));
    if (endpoint === '/inventory')
      return reply(route, {
        ...list([inventory]),
        businessDate: '2026-11-08',
        expiryWarningDays: 7,
      });
    if (endpoint.endsWith('/lots'))
      return reply(route, {
        location: store,
        product,
        ordering: 'FIFO',
        items: [
          {
            id: 'lot-1',
            lotNumber: 'Lô người dùng',
            quantityOnHand: '500',
            unitCost: '5000.25',
            receivedDate: '2026-11-01',
            expiryDate: null,
            expiryStatus: 'NOT_TRACKED',
          },
        ],
      });
    if (endpoint === '/users') return reply(route, list([user]));
    if (endpoint === '/reports/dashboard')
      return reply(route, {
        from: '2026-10-10',
        to: '2026-11-08',
        locationId: null,
        metrics: {
          revenue: '1000000.25',
          cogs: '600000',
          expenses: '100000',
          grossProfit: '400000.25',
          estimatedOperatingProfit: '300000.25',
          invoices: 2,
          quantity: '3.5',
        },
        trend: [
          { date: '2026-11-07', revenue: '500000' },
          { date: '2026-11-08', revenue: '500000.25' },
        ],
        topProducts: [
          { id: product.id, sku: product.sku, name: product.name, quantity: '3.5', unit: 'KG' },
        ],
        storeComparison: [
          { ...store, revenue: '1000000.25', quantity: '3.5', grossProfit: '400000.25' },
        ],
        inventory: {
          asOf: '2026-11-08',
          quantity: '500',
          value: '2500125',
          activeProducts: 1,
          lowStockPairs: 0,
          expiredLots: 0,
          expiringLots: 0,
        },
      });
    if (['/sales', '/purchases', '/expenses', '/imports'].includes(endpoint))
      return reply(route, list([]));
    if (endpoint === '/forecasts/runs') return reply(route, list([forecast]));
    if (endpoint === '/forecasts/runs/forecast-1')
      return reply(route, options.forecastResult ?? forecast);
    if (endpoint === '/imports/templates')
      return reply(route, {
        types: Object.fromEntries(
          ['PRODUCT', 'SALE', 'INVENTORY', 'PURCHASE', 'EXPENSE'].map((k) => [
            k,
            { columns: ['sku'], required: ['sku'], instructions: '' },
          ]),
        ),
      });
    if (endpoint === '/forecasts/data')
      return reply(route, {
        origin: '2026-11-08',
        eligibleCount: 0,
        pairs: [],
        skipped: [],
        minimumHistoryDays: 30,
      });
    if (endpoint === '/forecasts/data/model') return reply(route, { available: false });
    if (options.recommendations && endpoint === '/replenishment')
      return reply(route, { ...list(options.recommendations), summary: {} });
    const recommendation = options.recommendations?.find(
      (r) => endpoint === `/replenishment/${r.id}`,
    );
    if (recommendation) return reply(route, recommendation);
    if (endpoint.includes('replenishment') || endpoint.includes('alerts'))
      return reply(route, { ...list([]), summary: {} });
    if (endpoint === '/ai-center/config')
      return reply(route, {
        stores: [store],
        fields: Object.fromEntries(
          ['SALES', 'PRODUCTS', 'INVENTORY'].map((k) => [
            k,
            { required: ['product_id', 'unit_code'], optional: [] },
          ]),
        ),
      });
    if (['/ai-center/datasets', '/ai-center/chat/sessions'].includes(endpoint))
      return reply(route, { items: [] });
    if (endpoint === '/ai-center/training') return reply(route, { items: [job] });
    if (endpoint === '/ai-center/training/job-1') return reply(route, job);
    if (endpoint === '/ai-center/chat/status')
      return reply(route, { available: true, model: 'test-model', state: 'READY', help: '' });
    if (endpoint === '/ai-center/models')
      return reply(route, {
        active: { model_version: 'test-model', algorithm: 'RollingMean28' },
        candidates: [],
        deployments: [],
      });
    unknown.push(endpoint);
    return reply(route, {});
  });
  return { writes, unknown };
}
