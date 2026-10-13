import type { DisplayUnit } from './format';
export type DecisionStatus = 'PENDING' | 'ACCEPTED' | 'ADJUSTED' | 'REJECTED';
export type Recommendation = {
  id: string; locationId: string; productId: string; demandForecastId: string;
  currentStockSnapshot: string; incomingStockSnapshot: string; safetyStockSnapshot: string; recommendedQuantity: string;
  demandQuantitySnapshot?: string | null; demandPeriodStart?: string | null; demandPeriodEnd?: string | null;
  managerQuantity: string | null; decisionStatus: DecisionStatus; decisionNote: string | null; decidedAt: string | null;
  location: { id: string; code: string; name: string };
  dataSource?: string;
  product: { id: string; name: string; sku: string; imageKey?: string | null; purchaseToBaseRatio: string | null; baseUnit: DisplayUnit | null; purchaseUnit: DisplayUnit | null };
  forecast: { predictedQuantity: string; periodStart: string; periodEnd: string; createdAt: string; run: { modelVersion: string } };
  purchaseOrder: { id: string; orderNumber: string; status: string } | null;
  expectedPurchaseQuantity: string | null; expectedBaseQuantity: string | null;
};
export type InventoryAlert = { id: string; alertType: 'STOCKOUT_RISK' | 'OVERSTOCK_RISK' | 'EXPIRY_RISK'; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'RESOLVED'; message: string; detectedAt: string; resolvedAt: string | null; locationId: string; productId: string; demandForecastId: string | null;
  location: { name: string; code: string }; product: { name: string; sku: string; imageKey?: string | null; baseUnit: DisplayUnit | null }; lot: { lotNumber: string | null; expiryDate: string | null; quantityOnHand: string } | null };
export const quantity = (value: string | null) => value === null ? '—' : new Intl.NumberFormat('vi-VN',{ maximumFractionDigits: 4 }).format(Number(value));
