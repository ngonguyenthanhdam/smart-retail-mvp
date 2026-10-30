export type Dashboard = {
  from: string; to: string; locationId: string | null;
  metrics: { revenue: string; cogs: string; expenses: string; grossProfit: string; estimatedOperatingProfit: string; invoices: number; quantity: string };
  trend: { date: string; revenue: string }[];
  topProducts: { id: string; sku: string; name: string; quantity: string; unit: string | null }[];
  storeComparison?: { id: string; code: string; name: string; revenue: string; quantity: string; grossProfit: string }[];
  inventory: { asOf: string; quantity: string; value: string; activeProducts: number; lowStockPairs: number; expiredLots: number; expiringLots: number };
};

export function displayReportDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}
