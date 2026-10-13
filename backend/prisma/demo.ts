import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { addDays, businessDate } from '../src/inventory/expiry';

// Reserved demo IDs allow reruns without overwriting edited records or replenishing lots.
export const demoId = (number: number) => `d3202600-0000-4000-8000-${String(number).padStart(12, '0')}`;
export async function seedProductInventoryDemo(prisma: PrismaClient) {
  const now = new Date(); const today = businessDate(now);
  return prisma.$transaction(async (tx) => {
    for (const [n, code, name] of [[1, 'RETAIL-BEV', 'Đồ uống'], [2, 'RETAIL-FOOD', 'Thực phẩm']] as const) {
      await tx.category.upsert({ where: { id: demoId(n) }, update: {}, create: { id: demoId(n), code, name, createdAt: now } });
    }
    for (const [n, code, name, symbol] of [[3, 'RETAIL-PCS', 'Cái', 'cái'], [4, 'RETAIL-CAN', 'Lon', 'lon'], [5, 'RETAIL-CTN', 'Thùng', 'thùng']] as const) {
      await tx.unit.upsert({ where: { id: demoId(n) }, update: {}, create: { id: demoId(n), code, name, symbol, allowFraction: false } });
    }
    for (const [n, code, name] of [[6, 'RETAIL-ST01', 'Cửa hàng Bến Sông'], [7, 'RETAIL-ST02', 'Cửa hàng Vườn Xanh']] as const) {
      await tx.location.upsert({ where: { id: demoId(n) }, update: {}, create: { id: demoId(n), code, name, locationType: 'STORE', createdAt: now } });
    }
    for (const [n, sku, name, category, base, ratio, cost, trackExpiry] of [
      [8, 'RETAIL-MILK', 'Sữa tươi 250 ml', 1, 3, '24', '6000', true],
      [9, 'RETAIL-WATER', 'Nước khoáng có ga 330 ml', 1, 4, '24', '4000', false],
      [10, 'RETAIL-RICE', 'Gạo túi 1 kg', 2, 3, '1', '22000', false],
    ] as const) {
      await tx.product.upsert({ where: { id: demoId(n) }, update: {}, create: { id: demoId(n), sku, name, imageKey: n === 8 ? 'milk' : n === 9 ? 'drinks' : 'rice', categoryId: demoId(category), baseUnitId: demoId(base), purchaseUnitId: demoId(n === 10 ? 3 : 5), purchaseToBaseRatio: ratio, defaultCost: cost, trackExpiry, shelfLifeDays: trackExpiry ? 14 : null, createdAt: now } });
    }
    for (const [n, location, product, sellingPrice] of [[11, 6, 8, '9000'], [12, 6, 9, '7000'], [13, 6, 10, '28000'], [14, 7, 8, '9500']] as const) {
      const store = await tx.location.findUniqueOrThrow({ where: { id: demoId(location) } });
      if (store.locationType !== 'STORE' || !store.isActive || store.deletedAt) throw new Error('Demo store is no longer an active STORE.');
      await tx.storeProduct.upsert({ where: { id: demoId(n) }, update: {}, create: { id: demoId(n), locationId: demoId(location), productId: demoId(product), sellingPrice, safetyStock: '10', minStockLevel: '5' } });
    }
    for (const [n, location, product, lotNumber, quantity, unitCost, received, expiry] of [
      [15, 6, 8, 'LOT-MILK-SOON', '12', '6000', -3, 3],
      [16, 6, 8, 'LOT-MILK-LATER', '24', '6200', -1, 12],
      [17, 6, 9, 'LOT-WATER-OLD', '2', '4000', -7, null],
      [18, 6, 9, 'LOT-WATER-NEW', '1', '4100', -2, null],
      [19, 7, 8, 'LOT-MILK-GARDEN', '8', '6000', -2, 8],
    ] as const) {
      await tx.inventoryLot.upsert({ where: { id: demoId(n) }, update: {}, create: { id: demoId(n), locationId: demoId(location), productId: demoId(product), lotNumber, quantityOnHand: quantity, unitCost, receivedDate: new Date(addDays(today, received)), expiryDate: expiry === null ? null : new Date(addDays(today, expiry)), purchaseOrderItemId: null, createdAt: now } });
    }
    return { stores: 2, categories: 2, units: 3, products: 3, storeProducts: 4, lots: 5 };
  }, { isolationLevel: 'Serializable' });
}
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, options: '-c timezone=UTC' }) });
  try { console.log('Product/inventory demo ready:', await seedProductInventoryDemo(prisma)); }
  finally { await prisma.$disconnect(); }
}
if (require.main === module) void main().catch(() => {
  console.error('Demo setup failed. Check migrations and existing DEMO-* records. No partial setup was saved.');
  process.exitCode = 1;
});
