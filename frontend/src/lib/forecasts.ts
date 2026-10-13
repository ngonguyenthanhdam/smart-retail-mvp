export type ForecastRun = {
  id: string; modelVersion: string; algorithm: string; horizonMonths: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'; startedAt: string; completedAt: string | null;
  origin: string | null; usageMode: string; realWorldAccuracyVerified: false; errorCode: string | null;
  forecastCount?: number;
  periodKind?: string; dataSource?: string; modelInfo?: { algorithm?: string; model_version?: string } | null;
  skipped: { locationId: string; productId: string; store: string; product: string; reason: string }[];
};
export type ForecastDetail = ForecastRun & {
  dailySeries?: { locationId: string; productId: string; dataSource: string; history: { date: string; quantity: number }[]; daily: { date: string; quantity: number }[] }[];
  forecasts: { id: string; locationId: string; productId: string; periodStart: string; periodEnd: string;
    predictedQuantity: string; estimatedUnitPrice: string; predictedRevenue: string; createdAt: string;
    location: { id: string; code: string; name: string };
    product: { id: string; sku: string; name: string; imageKey?: string | null; baseUnit: { code: string; name?: string; symbol: string | null; allowFraction: boolean } | null };
  }[];
};
export type ForecastReadiness = {
  origin: string; minimumHistoryDays: number; eligibleCount: number; skipped: ForecastRun['skipped'];
  pairs: { locationId: string; productId: string; store: string; product: string; unit: string; coverage: { periodStart: string; periodEnd: string; source: string }[] }[];
};
