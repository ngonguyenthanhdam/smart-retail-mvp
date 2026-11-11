import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { addDays, businessDate } from '../src/inventory/expiry';
import { dateValue } from '../src/common/operations';
import { demoForecastId as id, DEMO_JOB_ID, DEMO_SOURCE, DEMO_UPGRADE_JOB_ID } from '../src/forecasts/demo-source';
import '../src/common/decimal';
import { confirmRemainingStock } from '../src/store-products/assignment';

export const DEMO_SEED = 20260927;
export const forecastDemoProducts = [
  ['Nước khoáng có ga 330 ml', 'CAN', 7000],
  ['Nước cam có ga 330 ml', 'CAN', 10000],
  ['Sữa tươi 250 ml', 'PCS', 9000],
  ['Gạo túi 1 kg', 'PCS', 28000],
  ['Mì ăn liền', 'PCS', 5000],
  ['Bánh mì', 'PCS', 20000],
  ['Chuối', 'KG', 25000],
  ['Cà chua', 'KG', 30000],
  ['Cà rốt', 'KG', 24000],
  ['Trứng đóng hộp', 'PCS', 32000],
  ['Đậu đóng hộp', 'CAN', 22000],
  ['Khoai tây', 'KG', 26000],
  ['Cá phi lê', 'KG', 120000],
  ['Thịt gà', 'KG', 85000],
  ['Sữa chua hộp', 'PCS', 7000],
  ['Dầu ăn 1 lít', 'PCS', 45000],
  ['Nước rửa chén 750 ml', 'PCS', 32000],
  ['Táo', 'KG', 55000],
  ['Cà phê gói 250 g', 'PCS', 65000],
  ['Khăn giấy hộp', 'PCS', 18000],
] as const;

// Reuse suitable existing category illustrations; no replacement images are generated.
export const forecastDemoImageKeys = [
  'drinks', 'drinks', 'milk', 'rice', 'noodles', 'bakery', 'fruit',
  'vegetables', 'vegetables', 'eggs', 'canned', 'vegetables',
  'seafood', null, null, null, 'household', 'fruit', null, null,
] as const;

export const forecastDemoAssortments = [
  Array.from({ length: 12 }, (_, p) => p),
  [...Array.from({ length: 10 }, (_, p) => p), 12, 13, 14, 15, 16],
  [...Array.from({ length: 7 }, (_, p) => p), 17, 18, 19],
];
export const forecastDemoPairs = forecastDemoAssortments.flatMap((assortment, store) => assortment.map((p) => ({ store, p })));
export const forecastDemoSettingId = (store: number, p: number) => id(p < 12 ? 1000 + store * 12 + p : 2000 + store * 20 + p);

// Legacy generation is retained only to verify an existing v1 seed before a non-destructive upgrade.
export function buildForecastDemo(endDate: string, legacy = false) {
  const products = legacy ? forecastDemoProducts.slice(0, 12) : forecastDemoProducts;
  dateValue(endDate, 'Demo end date');
  const startDate = addDays(endDate, -89);
  let state = DEMO_SEED;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const sales: Prisma.SaleCreateManyInput[] = [];
  const items: Prisma.SaleItemCreateManyInput[] = [];
  let zeroDays = 0;
  for (let store = 0; store < 3; store++) {
    for (let day = 0; day < 90; day++) {
      const date = addDays(startDate, day);
      const dow = new Date(date).getUTCDay();
      const lines: Prisma.SaleItemCreateManyInput[] = [];
      for (let p = 0; p < products.length; p++) {
        const noise = random();
        if (!legacy && !forecastDemoAssortments[store]!.includes(p)) continue;
        const firstDay = p === 11 ? 76 : 0;
        if (day < firstDay) continue;
        const [, unit, basePrice] = products[p]!;
        const zero = day !== firstDay && ((day + p * 3 + store) % 11 === 0 || day % 29 === 19);
        if (zero) {
          zeroDays++;
          continue;
        }
        const level = unit === 'KG' ? 1.5 + p / 8 : 6 + p;
        const value =
          level *
          (1 + store * 0.15) *
          (dow === 0 || dow === 6 ? 1.35 : 0.9) *
          (0.85 + day / 300) *
          (0.6 + noise * 0.8);
        const quantity =
          unit === 'KG'
            ? new Prisma.Decimal(value.toFixed(2))
            : new Prisma.Decimal(Math.max(1, Math.round(value)));
        const price = new Prisma.Decimal(basePrice + store * 500);
        lines.push({
          id: id(p < 12 ? 20000 + store * 1500 + day * 12 + p : 60000 + store * 1000 + day * 8 + p - 12),
          saleId: id(10000 + store * 100 + day),
          productId: id(200 + p),
          quantity,
          unitPrice: price,
          discountAmount: 0,
          lineTotal: quantity.mul(price).toDecimalPlaces(2),
          costOfGoodsSold: quantity.mul(price).mul('0.65').toDecimalPlaces(2),
          promotionFlag: false,
        });
      }
      if (!lines.length) continue;
      const subtotal = lines.reduce(
        (sum, line) => sum.add(String(line.lineTotal)),
        new Prisma.Decimal(0),
      );
      sales.push({
        id: id(10000 + store * 100 + day),
        invoiceNumber: `SYN-FC-${store + 1}-${date}`,
        importJobId: DEMO_JOB_ID,
        locationId: id(100 + store),
        soldAt: new Date(`${date}T05:00:00Z`),
        subtotal,
        discountAmount: 0,
        totalAmount: subtotal,
        status: 'COMPLETED',
        createdAt: new Date(`${date}T05:00:00Z`),
      });
      items.push(...lines);
    }

    sales.push({
      id: id(50000 + store),
      invoiceNumber: `SYN-FC-VOID-${store + 1}`,
      importJobId: DEMO_JOB_ID,
      locationId: id(100 + store),
      soldAt: new Date(`${endDate}T06:00:00Z`),
      subtotal: 700000,
      totalAmount: 700000,
      discountAmount: 0,
      status: 'VOIDED',
      createdAt: new Date(`${endDate}T06:00:00Z`),
    });
    items.push({
      id: id(51000 + store),
      saleId: id(50000 + store),
      productId: id(200),
      quantity: 100,
      unitPrice: 7000,
      lineTotal: 700000,
      discountAmount: 0,
      costOfGoodsSold: 455000,
      promotionFlag: false,
    });
  }
  const manifest = {
    source: DEMO_SOURCE,
    seed: DEMO_SEED,
    startDate,
    endDate,
    stores: 3,
    products: legacy ? 12 : 20,
    configurations: legacy ? 36 : 37,
    fullHistoryPairs: legacy ? 33 : 36,
    shortHistoryPairs: legacy ? 3 : 1,
    shortHistoryDays: 14,
    coveredCalendarDays: 90,
    zeroSalesPairDays: zeroDays,
    invoices: sales.length,
    saleItems: items.length,
    voidedInvoices: 3,
  };
  const hash = createHash('sha256')
    .update(JSON.stringify({ manifest, sales, items }))
    .digest('hex');
  return { manifest, hash, sales, items };
}

export async function seedForecastDemo(
  prisma: PrismaClient,
  endDate = addDays(businessDate(), -1),
  options: { upgradeExisting?: boolean; confirmDiscontinue?: boolean } = {},
) {
  if (endDate >= businessDate())
    throw new Error('Demo history must end before the current business date.');
  const data = buildForecastDemo(endDate);
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.importJob.findUnique({ where: { id: DEMO_JOB_ID } });
      if (existing) {
        if (existing.fileHash === data.hash && existing.status === 'COMPLETED')
          return { ...data.manifest, hash: data.hash, alreadyPresent: true };
        const legacy = buildForecastDemo(endDate, true);
        if (existing.fileHash !== legacy.hash || existing.status !== 'COMPLETED')
          throw new Error('A different demo already exists. Use its original end date; records will not be replaced.');
        const upgrade = await tx.importJob.findUnique({ where: { id: DEMO_UPGRADE_JOB_ID } });
        if (upgrade?.fileHash === data.hash && upgrade.status === 'COMPLETED')
          return { ...data.manifest, hash: data.hash, alreadyPresent: true, upgraded: true };
        if (!options.upgradeExisting)
          throw new Error('A legacy demo exists. Use --upgrade-existing with its original end date to retain old history and append new demo pairs.');
        if (upgrade) throw new Error('Conflicting demo upgrade marker. No data was changed.');
        return upgradeForecastDemo(tx, data, existing.createdBy!, options.confirmDiscontinue ?? false);
      }
      const admin = await tx.user.findFirst({
        where: { role: { code: 'ADMIN' }, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!admin) throw new Error('An active ADMIN is required.');
      const createdAt = new Date(`${data.manifest.startDate}T00:00:00Z`);
      await tx.category.create({
        data: {
          id: id(1),
          code: 'FC-GOODS',
          name: 'Hàng tiêu dùng',
          externalSource: DEMO_SOURCE,
          createdAt,
        },
      });
      const units = ['CAN', 'PCS', 'KG'];
      await tx.unit.createMany({
        data: units.map((unit, n) => ({
          id: id(10 + n),
          code: `FC-${unit}`,
          name: ['Lon', 'Cái', 'Kilôgam'][n]!,
          symbol: ['lon', 'cái', 'kg'][n]!,
          allowFraction: unit === 'KG',
        })),
      });
      await tx.location.createMany({
        data: ['Bến Sông', 'Vườn Xanh', 'Trung Tâm'].map((name, n) => ({
          id: id(100 + n),
          code: `FC-ST0${n + 1}`,
          name: `Cửa hàng ${name}`,
          locationType: 'STORE',
          externalSource: DEMO_SOURCE,
          externalId: String(n + 1),
          createdAt,
        })),
      });
      await tx.product.createMany({
        data: forecastDemoProducts.map(([name, unit, price], n) => ({
          id: id(200 + n),
          sku: `FC-${String(n + 1).padStart(2, '0')}`,
          name,
          imageKey: forecastDemoImageKeys[n],
          categoryId: id(1),
          baseUnitId: id(10 + units.indexOf(unit)),
          purchaseUnitId: id(10 + units.indexOf(unit)),
          purchaseToBaseRatio: 1,
          defaultCost: new Prisma.Decimal(price).mul('0.65'),
          defaultSellingPrice: price,
          defaultMinStockLevel: 2,
          defaultSafetyStock: 5,
          externalSource: DEMO_SOURCE,
          externalId: String(n + 1),
          createdAt,
        })),
      });
      await tx.storeProduct.createMany({
        data: forecastDemoPairs.map(({ store, p }) => ({
          id: forecastDemoSettingId(store, p),
          locationId: id(100 + store),
          productId: id(200 + p),
          sellingPrice: forecastDemoProducts[p]![2] + store * 500,
          safetyStock: 5,
          minStockLevel: 2,
        })),
      });
      await tx.importJob.create({
        data: {
          id: DEMO_JOB_ID,
          importType: 'SALE',
          fileName: `SYNTHETIC_forecast_v2_${endDate}.seed`,
          fileHash: data.hash,
          status: 'COMPLETED',
          totalRows: data.items.length,
          successRows: data.items.length,
          failedRows: 0,
          createdBy: admin.id,
          createdAt: new Date(),
          completedAt: new Date(),
        },
      });
      await tx.sale.createMany({
        data: data.sales.map((sale) => ({ ...sale, createdBy: admin.id })),
      });
      await tx.saleItem.createMany({ data: data.items });
      await tx.salesHistoryCoverage.createMany({
        data: forecastDemoPairs.map(({ store, p }) => ({
          locationId: id(100 + store),
          productId: id(200 + p),
          periodStart: new Date(addDays(data.manifest.startDate, p === 11 ? 76 : 0)),
          periodEnd: new Date(endDate),
          source: 'SYNTHETIC',
          note: 'Lịch sử mô phỏng có đủ ngày theo bộ sinh dữ liệu cố định.',
          confirmedBy: admin.id,
        })),
      });
      return { ...data.manifest, hash: data.hash, alreadyPresent: false };
    },
    { isolationLevel: 'Serializable', timeout: 30000 },
  );
}

async function upgradeForecastDemo(
  tx: Prisma.TransactionClient, data: ReturnType<typeof buildForecastDemo>, adminId: string, confirm: boolean,
) {
  // Never adopt unrelated records that happen to share reserved SKU/code values.
  const oldProducts = await tx.product.findMany({ where: { id: { in: Array.from({ length: 12 }, (_, p) => id(200 + p)) } } });
  const stores = await tx.location.findMany({ where: { id: { in: [100, 101, 102].map(id) } } });
  if (oldProducts.length !== 12 || stores.length !== 3 ||
      oldProducts.some((p) => p.externalSource !== DEMO_SOURCE || p.deletedAt) ||
      stores.some((s) => s.externalSource !== DEMO_SOURCE || !s.isActive || s.deletedAt))
    throw new Error('Legacy demo ownership or active stores could not be verified.');
  for (const product of oldProducts) {
    const p = Number(product.externalId) - 1;
    if (id(200 + p) !== product.id || product.sku !== `FC-${String(p + 1).padStart(2, '0')}`)
      throw new Error('Legacy product identifiers changed. No records were replaced.');
    // Only fill the newly-added fields; never overwrite a business edit.
    if (product.defaultSellingPrice === null)
      await tx.product.update({ where: { id: product.id }, data: { defaultSellingPrice: forecastDemoProducts[p]![2] } });
  }
  const units = ['CAN', 'PCS', 'KG'];
  const createdAt = new Date(`${data.manifest.startDate}T00:00:00Z`);
  for (let p = 12; p < 20; p++) {
    const [name, unit, price] = forecastDemoProducts[p]!;
    await tx.product.create({ data: {
      id: id(200 + p), sku: `FC-${p + 1}`, name, imageKey: forecastDemoImageKeys[p],
      categoryId: id(1), baseUnitId: id(10 + units.indexOf(unit)), purchaseUnitId: id(10 + units.indexOf(unit)),
      purchaseToBaseRatio: 1, defaultCost: new Prisma.Decimal(price).mul('0.65'),
      defaultSellingPrice: price, defaultSafetyStock: 5, defaultMinStockLevel: 2,
      externalSource: DEMO_SOURCE, externalId: String(p + 1), createdAt,
    } });
  }
  for (let store = 0; store < 3; store++) {
    for (let p = 0; p < 12; p++) {
      if (forecastDemoAssortments[store]!.includes(p)) continue;
      const setting = await tx.storeProduct.findUnique({ where: { id: forecastDemoSettingId(store, p) } });
      if (!setting || setting.productId !== id(200 + p) || setting.locationId !== id(100 + store))
        throw new Error('Legacy store assignment ownership could not be verified.');
      await confirmRemainingStock(tx, id(200 + p), [id(100 + store)], confirm);
      await tx.storeProduct.update({ where: { id: setting.id }, data: { isActive: false } });
    }
  }
  const newPairs = forecastDemoPairs.filter(({ p }) => p >= 12);
  await tx.storeProduct.createMany({ data: newPairs.map(({ store, p }) => ({
    id: forecastDemoSettingId(store, p), locationId: id(100 + store), productId: id(200 + p),
    sellingPrice: forecastDemoProducts[p]![2] + store * 500, safetyStock: 5, minStockLevel: 2,
  })) });
  const newProductIds = new Set(newPairs.map(({ p }) => id(200 + p)));
  const items = data.items.filter((item) => newProductIds.has(item.productId!));
  const sales = data.sales.flatMap((sale) => {
    const lines = items.filter((item) => item.saleId === sale.id);
    if (!lines.length) return [];
    const subtotal = lines.reduce((sum, line) => sum.add(String(line.lineTotal)), new Prisma.Decimal(0));
    const saleId = id(80000 + Number(sale.id!.slice(-12)));
    for (const line of lines) line.saleId = saleId;
    return [{ ...sale, id: saleId, invoiceNumber: sale.invoiceNumber.replace('SYN-FC-', 'SYN-FC2-'),
      importJobId: DEMO_UPGRADE_JOB_ID, subtotal, totalAmount: subtotal, createdBy: adminId }];
  });
  await tx.importJob.create({ data: {
    id: DEMO_UPGRADE_JOB_ID, importType: 'SALE', fileName: `SYNTHETIC_forecast_v2_upgrade_${data.manifest.endDate}.seed`,
    fileHash: data.hash, status: 'COMPLETED', totalRows: items.length, successRows: items.length,
    failedRows: 0, createdBy: adminId, createdAt: new Date(), completedAt: new Date(),
  } });
  await tx.sale.createMany({ data: sales });
  await tx.saleItem.createMany({ data: items });
  await tx.salesHistoryCoverage.createMany({ data: newPairs.map(({ store, p }) => ({
    locationId: id(100 + store), productId: id(200 + p),
    periodStart: new Date(data.manifest.startDate), periodEnd: new Date(data.manifest.endDate),
    source: 'SYNTHETIC', note: 'Synthetic v2 upgrade: new demo pairs only; legacy history preserved.', confirmedBy: adminId,
  })) });
  return { ...data.manifest, hash: data.hash, alreadyPresent: false, upgraded: true, addedInvoices: sales.length, addedSaleItems: items.length };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--confirm-demo') || process.env.NODE_ENV === 'production')
    throw new Error('Demo insertion requires --confirm-demo and a non-production database.');
  const flags = new Set(['--confirm-demo', '--upgrade-existing', '--confirm-discontinue-stock']);
  let endDate: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--end-date') { endDate = args[++i]; if (!endDate) throw new Error('Provide --end-date YYYY-MM-DD.'); }
    else if (!flags.has(args[i]!)) throw new Error('Unknown demo option.');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, options: '-c timezone=UTC' }) });
  try {
    console.log(JSON.stringify(await seedForecastDemo(prisma, endDate, {
      upgradeExisting: args.includes('--upgrade-existing'), confirmDiscontinue: args.includes('--confirm-discontinue-stock'),
    }), null, 2));
  } finally { await prisma.$disconnect(); }
}
if (require.main === module)
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Synthetic seed failed; no partial seed committed.');
    process.exitCode = 1;
  });
