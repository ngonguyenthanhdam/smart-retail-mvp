import { apiRequest } from "@/lib/api";

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type Unit = { id: string; code: string; name: string; symbol: string | null; allowFraction?: boolean };
export type Product = {
  id: string; sku: string; barcode: string | null; name: string; categoryId: string | null; imageKey?: string | null;
  baseUnitId: string | null; purchaseUnitId: string | null; purchaseToBaseRatio: string | null;
  defaultCost?: string | null; trackExpiry: boolean | null; shelfLifeDays: number | null; isActive: boolean | null;
  category: { id: string; code: string; name: string } | null; baseUnit: Unit | null; purchaseUnit: Unit | null;
};
export type StoreProduct = { id: string; locationId: string; productId: string; sellingPrice: string; safetyStock: string | null; minStockLevel: string | null; isActive: boolean | null; location: { id: string; code: string; name: string }; product: Product };
export type ExpiryStatus = "NORMAL" | "EXPIRING_SOON" | "EXPIRED" | "NOT_TRACKED" | "NO_EXPIRY";
export type InventoryRow = { locationId: string; locationCode: string; locationName: string; locationType: string; productId: string; sku: string; productName: string; imageKey?: string | null; categoryId: string | null; categoryName: string | null; baseUnitCode: string | null; currentQuantity: string; sellableQuantity: string; sellingPrice: string | null; safetyStock: string | null; minStockLevel: string | null; lowStock: boolean; trackExpiry: boolean | null; earliestExpiry: string | null; expiryStatus: ExpiryStatus };
export type InventoryPage = Page<InventoryRow> & { businessDate: string; expiryWarningDays: number };
export type LotPage = { location: { name: string }; product: { name: string; sku: string; trackExpiry: boolean | null }; ordering: "FEFO" | "FIFO"; items: { id: string; lotNumber: string | null; quantityOnHand: string; unitCost?: string; receivedDate: string; expiryDate: string | null; expiryStatus: ExpiryStatus }[] };
export type Category = { id: string; code: string; name: string; parentId: string | null; isActive: boolean | null; parent: { id: string; name: string; code: string } | null };
export function saveRecord<T>(path: string, values: object, id?: string) {
  return apiRequest<T>(`${path}${id ? `/${id}` : ""}`, { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
}
export async function allOptions<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  for (;;) {
    const data = await apiRequest<Page<T>>(`${path}${path.includes("?") ? "&" : "?"}page=${page}&pageSize=100`, { signal });
    items.push(...data.items);
    if (page * data.pageSize >= data.total) return items;
    page++;
  }
}
