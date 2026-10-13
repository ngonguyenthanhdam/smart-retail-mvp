import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { addDays, businessDate } from '../inventory/expiry';
import { DEMO_JOB_ID, DEMO_SOURCE } from './demo-source';

export type DailyRow = { locationId: string; productId: string; date: string; quantity: string; synthetic: boolean };
export type HistoryPoint = { date: string; quantity: number };
export type Coverage = { locationId: string; productId: string; periodStart: Date; periodEnd: Date; source: string };
export function coveredDate(coverage: Coverage[], date: string) {
  return coverage.some(c => c.periodStart.toISOString().slice(0, 10) <= date && c.periodEnd.toISOString().slice(0, 10) >= date);
}
export function dailyHistory(rows: DailyRow[], origin: string, coverage: Coverage[] = []): HistoryPoint[] | null {
  const start = addDays(origin, -29);
  const dates = Array.from({ length: 30 }, (_, i) => addDays(start, i));
  if (!dates.every(date => coveredDate(coverage, date))) return null;
  const totals = new Map<string, Prisma.Decimal>();
  for (const row of rows.filter(row => row.date >= start && row.date <= origin)) {
    const quantity = new Prisma.Decimal(row.quantity);
    if (!quantity.isFinite() || quantity.isNegative()) throw new BadRequestException('INVALID_FORECAST_INPUT');
    totals.set(row.date, (totals.get(row.date) ?? new Prisma.Decimal(0)).add(quantity));
  }
  return dates.map(date => ({ date, quantity: Number(totals.get(date) ?? 0) }));
}

@Injectable()
export class ForecastHistory {
  constructor(private readonly prisma: PrismaService) {}
  async snapshot(locationId?: string) {
    return this.prisma.$transaction(async tx => {
      const pairs = await tx.storeProduct.findMany({ where: { isActive: true,
        ...(locationId ? { locationId } : {}), location: { isActive: true, deletedAt: null, locationType: 'STORE' },
        product: { isActive: true, deletedAt: null, baseUnitId: { not: null } } },
        select: { locationId: true, productId: true, sellingPrice: true,
          location: { select: { name: true, externalSource: true } },
          product: { select: { name: true, externalSource: true, baseUnit: { select: { code: true, symbol: true } } } } },
        orderBy: [{ locationId: 'asc' }, { productId: 'asc' }], take: 101 });
      if (pairs.length > 100) throw new BadRequestException('Chọn tối đa 100 cặp cửa hàng – sản phẩm mỗi lần.');
      const coverage = await tx.salesHistoryCoverage.findMany({ where: { ...(locationId ? { locationId } : {}),
        OR: pairs.map(p => ({ locationId: p.locationId!, productId: p.productId! })) }, orderBy: { periodEnd: 'desc' } });
      const yesterday = addDays(businessDate(), -1);
      const origin = coverage.length ? [coverage[0]!.periodEnd.toISOString().slice(0, 10), yesterday].sort()[0]! : yesterday;
      const daily = await tx.$queryRaw<DailyRow[]>(Prisma.sql`
        SELECT s.location_id AS "locationId", i.product_id AS "productId",
          (s.sold_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS date,
          SUM(i.quantity)::text AS quantity, BOOL_AND(COALESCE(s.import_job_id = ${DEMO_JOB_ID}::uuid, false)) AS synthetic
        FROM sales s JOIN sale_items i ON i.sale_id = s.id
        JOIN store_products sp ON sp.location_id=s.location_id AND sp.product_id=i.product_id
        JOIN products p ON p.id=i.product_id JOIN locations l ON l.id=s.location_id
        WHERE s.status='COMPLETED' AND sp.is_active AND p.is_active AND p.deleted_at IS NULL
          AND l.is_active AND l.deleted_at IS NULL AND l.location_type='STORE'
          AND (s.sold_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= ${origin}::date
          ${locationId ? Prisma.sql`AND s.location_id=${locationId}::uuid` : Prisma.empty}
        GROUP BY s.location_id, i.product_id, (s.sold_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date ORDER BY 1,2,3`);
      return { origin, pairs, daily, coverage, coverageVerified: coverage.length > 0 };
    }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
  }
}

export type ForecastSnapshot = Awaited<ReturnType<ForecastHistory['snapshot']>>;
export function seriesAt(snapshot: ForecastSnapshot, origin = snapshot.origin) {
  if (origin > snapshot.origin) throw new BadRequestException('INVALID_FORECAST_INPUT');
  const eligible = []; const skipped = [];
  for (const pair of snapshot.pairs) {
    const rows = snapshot.daily.filter(row => row.locationId === pair.locationId && row.productId === pair.productId && row.date <= origin);
    const coverage = snapshot.coverage.filter(c => c.locationId === pair.locationId && c.productId === pair.productId);
    const history = dailyHistory(rows, origin, coverage);
    const first = coverage.map(c => c.periodStart.toISOString().slice(0, 10)).sort()[0];
    const reason = history ? null : !first || first > addDays(origin, -29) ? 'INSUFFICIENT_HISTORY' : 'INCOMPLETE_HISTORY';
    if (reason) skipped.push({ locationId: pair.locationId!, productId: pair.productId!, store: pair.location!.name, product: pair.product!.name, reason });
    else eligible.push({ ...pair, locationId: pair.locationId!, productId: pair.productId!, history: history!,
      dataSource: pair.product?.externalSource === DEMO_SOURCE || pair.location?.externalSource === DEMO_SOURCE
        || rows.some(r => r.synthetic && r.date >= addDays(origin, -29))
        || coverage.some(c => c.source === 'SYNTHETIC' && c.periodEnd.toISOString().slice(0, 10) >= addDays(origin, -29)
        && c.periodStart.toISOString().slice(0, 10) <= origin) ? 'SYNTHETIC' : 'STORE_HISTORY' });
  }
  return { eligible, skipped };
}
