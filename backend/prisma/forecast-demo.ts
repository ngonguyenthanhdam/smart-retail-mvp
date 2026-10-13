import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { addDays, businessDate } from '../src/inventory/expiry';
import { dateValue } from '../src/common/operations';
import { demoForecastId as id, DEMO_JOB_ID, DEMO_SOURCE } from '../src/forecasts/demo-source';
import '../src/common/decimal';

export const DEMO_SEED = 20260927;
const products = [
  ['Nước khoáng có ga 330 ml', 'CAN', 7000], ['Nước cam có ga 330 ml', 'CAN', 10000],
  ['Sữa tươi 250 ml', 'PCS', 9000], ['Gạo túi 1 kg', 'PCS', 28000],
  ['Mì ăn liền', 'PCS', 5000], ['Bánh mì', 'PCS', 20000],
  ['Chuối', 'KG', 25000], ['Cà chua', 'KG', 30000], ['Cà rốt', 'KG', 24000],
  ['Trứng đóng hộp', 'PCS', 32000], ['Đậu đóng hộp', 'CAN', 22000], ['Khoai tây', 'KG', 26000],
] as const;

export function buildForecastDemo(endDate: string) {
  dateValue(endDate, 'Demo end date');
  const startDate = addDays(endDate, -89);
  let state = DEMO_SEED;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const sales: Prisma.SaleCreateManyInput[] = []; const items: Prisma.SaleItemCreateManyInput[] = [];
  let zeroDays = 0;
  for (let store = 0; store < 3; store++) {
    for (let day = 0; day < 90; day++) {
      const date = addDays(startDate, day); const dow = new Date(date).getUTCDay();
      const lines: Prisma.SaleItemCreateManyInput[] = [];
      for (let p = 0; p < products.length; p++) {
        const noise = random(); const firstDay = p === 11 ? 76 : 0;
        if (day < firstDay) continue;
        const [, unit, basePrice] = products[p]!;
        const zero = day !== firstDay && ((day + p * 3 + store) % 11 === 0 || day % 29 === 19);
        if (zero) { zeroDays++; continue; }
        const level = unit === 'KG' ? 1.5 + p / 8 : 6 + p;
        const value = level * (1 + store * 0.15) * (dow === 0 || dow === 6 ? 1.35 : 0.9)
          * (0.85 + day / 300) * (0.6 + noise * 0.8);
        const quantity = unit === 'KG' ? new Prisma.Decimal(value.toFixed(2)) : new Prisma.Decimal(Math.max(1, Math.round(value)));
        const price = new Prisma.Decimal(basePrice + store * 500);
        lines.push({ id: id(20000 + store * 1500 + day * 12 + p), saleId: id(10000 + store * 100 + day), productId: id(200 + p),
          quantity, unitPrice: price, discountAmount: 0, lineTotal: quantity.mul(price).toDecimalPlaces(2),
          costOfGoodsSold: quantity.mul(price).mul('0.65').toDecimalPlaces(2), promotionFlag: false });
      }
      if (!lines.length) continue;
      const subtotal = lines.reduce((sum, line) => sum.add(String(line.lineTotal)), new Prisma.Decimal(0));
      sales.push({ id: id(10000 + store * 100 + day), invoiceNumber: `SYN-FC-${store + 1}-${date}`, importJobId: DEMO_JOB_ID,
        locationId: id(100 + store), soldAt: new Date(`${date}T05:00:00Z`), subtotal, discountAmount: 0, totalAmount: subtotal,
        status: 'COMPLETED', createdAt: new Date(`${date}T05:00:00Z`) });
      items.push(...lines);
    }
    // A historical void fixture proves it never contributes to daily demand.
    sales.push({ id: id(50000 + store), invoiceNumber: `SYN-FC-VOID-${store + 1}`, importJobId: DEMO_JOB_ID,
      locationId: id(100 + store), soldAt: new Date(`${endDate}T06:00:00Z`), subtotal: 700000, totalAmount: 700000,
      discountAmount: 0, status: 'VOIDED', createdAt: new Date(`${endDate}T06:00:00Z`) });
    items.push({ id: id(51000 + store), saleId: id(50000 + store), productId: id(200), quantity: 100, unitPrice: 7000,
      lineTotal: 700000, discountAmount: 0, costOfGoodsSold: 455000, promotionFlag: false });
  }
  const manifest = { source: DEMO_SOURCE, seed: DEMO_SEED, startDate, endDate, stores: 3, products: 12,
    configurations: 36, fullHistoryPairs: 33, shortHistoryPairs: 3, shortHistoryDays: 14,
    coveredCalendarDays: 90, zeroSalesPairDays: zeroDays, invoices: sales.length, saleItems: items.length, voidedInvoices: 3 };
  const hash = createHash('sha256').update(JSON.stringify({ manifest, sales, items })).digest('hex');
  return { manifest, hash, sales, items };
}

export async function seedForecastDemo(prisma: PrismaClient, endDate = addDays(businessDate(), -1)) {
  if (endDate >= businessDate()) throw new Error('Demo history must end before the current business date.');
  const data = buildForecastDemo(endDate);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.importJob.findUnique({ where: { id: DEMO_JOB_ID } });
    if (existing) {
      if (existing.fileHash !== data.hash || existing.status !== 'COMPLETED') throw new Error('A different demo already exists. Rerun with its original end date; records will not be replaced.');
      return { ...data.manifest, hash: data.hash, alreadyPresent: true };
    }
    const admin = await tx.user.findFirst({ where: { role: { code: 'ADMIN' }, isActive: true, deletedAt: null }, select: { id: true } });
    if (!admin) throw new Error('An active ADMIN is required.');
    const createdAt = new Date(`${data.manifest.startDate}T00:00:00Z`);
    await tx.category.create({ data: { id: id(1), code: 'FC-GOODS', name: 'Hàng tiêu dùng', externalSource: DEMO_SOURCE, createdAt } });
    const units = ['CAN', 'PCS', 'KG'];
    await tx.unit.createMany({ data: units.map((unit, n) => ({ id: id(10 + n), code: `FC-${unit}`, name: ['Lon', 'Cái', 'Kilôgam'][n]!, symbol: ['lon','cái','kg'][n]!, allowFraction: unit === 'KG' })) });
    await tx.location.createMany({ data: ['Bến Sông', 'Vườn Xanh', 'Trung Tâm'].map((name, n) => ({ id: id(100 + n), code: `FC-ST0${n + 1}`,
      name: `Cửa hàng ${name}`, locationType: 'STORE', externalSource: DEMO_SOURCE, externalId: String(n + 1), createdAt })) });
    await tx.product.createMany({ data: products.map(([name, unit, price], n) => ({ id: id(200 + n), sku: `FC-${String(n + 1).padStart(2, '0')}`,
      name, imageKey: ['drinks','drinks','milk','rice','noodles','bakery','fruit','vegetables','vegetables','eggs','canned','vegetables'][n],
      categoryId: id(1), baseUnitId: id(10 + units.indexOf(unit)), purchaseUnitId: id(10 + units.indexOf(unit)),
      purchaseToBaseRatio: 1, defaultCost: new Prisma.Decimal(price).mul('0.65'), externalSource: DEMO_SOURCE, externalId: String(n + 1), createdAt })) });
    await tx.storeProduct.createMany({ data: Array.from({ length: 36 }, (_, n) => ({ id: id(1000 + n), locationId: id(100 + Math.floor(n / 12)),
      productId: id(200 + n % 12), sellingPrice: products[n % 12]![2] + Math.floor(n / 12) * 500, safetyStock: 5, minStockLevel: 2 })) });
    await tx.importJob.create({ data: { id: DEMO_JOB_ID, importType: 'SALE', fileName: `SYNTHETIC_forecast_v1_${endDate}.seed`, fileHash: data.hash,
      status: 'COMPLETED', totalRows: data.items.length, successRows: data.items.length, failedRows: 0, createdBy: admin.id, createdAt: new Date(), completedAt: new Date() } });
    await tx.sale.createMany({ data: data.sales.map((sale) => ({ ...sale, createdBy: admin.id })) });
    await tx.saleItem.createMany({ data: data.items });
    await tx.salesHistoryCoverage.createMany({ data: Array.from({ length: 36 }, (_, n) => ({ locationId: id(100 + Math.floor(n / 12)),
      productId: id(200 + n % 12), periodStart: new Date(addDays(data.manifest.startDate, n % 12 === 11 ? 76 : 0)),
      periodEnd: new Date(endDate), source: 'SYNTHETIC', note: 'Lịch sử mô phỏng có đủ ngày theo bộ sinh dữ liệu cố định.', confirmedBy: admin.id })) });
    return { ...data.manifest, hash: data.hash, alreadyPresent: false };
  }, { isolationLevel: 'Serializable', timeout: 30000 });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--end-date')) throw new Error('Use --end-date YYYY-MM-DD.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, options: '-c timezone=UTC' }) });
  try { console.log(JSON.stringify(await seedForecastDemo(prisma, args[1]), null, 2)); }
  finally { await prisma.$disconnect(); }
}
if (require.main === module) void main().catch(() => {
  console.error('Synthetic demo seed failed. Check migrations, the original end date and reserved DEMO-FC records. No partial seed was committed.'); process.exitCode = 1;
});
