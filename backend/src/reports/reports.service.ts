import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { bodyObject, uuidValue } from '../common/validation';
import { dateValue } from '../common/operations';
import { addDays, businessDate } from '../inventory/expiry';

type Metrics = { revenue: string; cogs: string; expenses: string; quantity: string; invoices: number };
type StoreRow = { id: string; code: string; name: string; revenue: string; cogs: string; quantity: string };
const profit = (revenue: string, cogs: string, expenses = '0') => new Prisma.Decimal(revenue).sub(cogs).sub(expenses).toFixed(2);

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}
  async dashboard(input: unknown, user: AuthenticatedUser) {
    const query = bodyObject(input, ['from','to','locationId']); const today = businessDate();
    const from = dateValue(query.from ?? addDays(today, -29), 'From date'); const to = dateValue(query.to ?? today, 'To date');
    if (from > to || to.getTime() - from.getTime() >= 366 * 86400000) throw new BadRequestException('Choose an ordered date range of at most 366 days.');
    const locationId = resolveLocationScope(user, query.locationId === undefined ? undefined : uuidValue(query.locationId));
    if (locationId && !await this.prisma.location.findFirst({ where: { id: locationId, locationType: 'STORE', deletedAt: null } })) throw new BadRequestException('Select an existing store.');
    const start = new Date(from.getTime() - 7 * 3600000); const end = new Date(to.getTime() + 17 * 3600000);
    const sales = Prisma.sql`s.status = 'COMPLETED' AND s.sold_at >= ${start} AND s.sold_at < ${end} ${locationId ? Prisma.sql`AND s.location_id = ${locationId}::uuid` : Prisma.empty}`;
    const expenses = Prisma.sql`e.expense_date >= ${from}::date AND e.expense_date <= ${to}::date ${locationId ? Prisma.sql`AND e.location_id = ${locationId}::uuid` : Prisma.empty}`;
    const lotScope = locationId ? Prisma.sql`AND l.location_id = ${locationId}::uuid` : Prisma.empty;
    return this.prisma.$transaction(async (tx) => {
      const [metrics] = await tx.$queryRaw<Metrics[]>(Prisma.sql`
        WITH selected AS (SELECT s.* FROM sales s WHERE ${sales})
        SELECT COALESCE((SELECT SUM(total_amount) FROM selected),0)::text AS revenue,
          COALESCE((SELECT SUM(i.cost_of_goods_sold) FROM selected s JOIN sale_items i ON i.sale_id = s.id),0)::text AS cogs,
          COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE ${expenses}),0)::text AS expenses,
          COALESCE((SELECT SUM(i.quantity) FROM selected s JOIN sale_items i ON i.sale_id = s.id),0)::text AS quantity,
          (SELECT COUNT(*)::int FROM selected) AS invoices`);
      const daily = await tx.$queryRaw<{ date: string; revenue: string }[]>(Prisma.sql`
        SELECT (s.sold_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS date, SUM(s.total_amount)::text AS revenue
        FROM sales s WHERE ${sales} GROUP BY 1 ORDER BY 1`);
      const dailyMap = new Map(daily.map((d) => [d.date, d.revenue])); const trend = [];
      for (let date = from.toISOString().slice(0,10); date <= to.toISOString().slice(0,10); date = addDays(date, 1)) trend.push({ date, revenue: dailyMap.get(date) ?? '0.00' });
      const topProducts = await tx.$queryRaw<{ id: string; sku: string; name: string; quantity: string; unit: string | null }[]>(Prisma.sql`
        SELECT p.id, p.sku, p.name, SUM(f.quantity_sold)::text AS quantity, u.code AS unit
        FROM v_sales_daily_facts f JOIN products p ON p.id = f.product_id LEFT JOIN units u ON u.id = p.base_unit_id
        WHERE f.business_date >= ${from}::date AND f.business_date <= ${to}::date ${locationId ? Prisma.sql`AND f.location_id = ${locationId}::uuid` : Prisma.empty}
        GROUP BY p.id, u.code ORDER BY SUM(f.quantity_sold) DESC, p.sku LIMIT 10`);
      const [stock] = await tx.$queryRaw<{ quantity: string; value: string; expiredLots: number; expiringLots: number }[]>(Prisma.sql`
        SELECT COALESCE(SUM(l.quantity_on_hand),0)::text AS quantity, COALESCE(SUM(l.quantity_on_hand * l.unit_cost),0)::text AS value,
          COUNT(*) FILTER (WHERE l.quantity_on_hand > 0 AND l.expiry_date < ${today}::date)::int AS "expiredLots",
          COUNT(*) FILTER (WHERE l.quantity_on_hand > 0 AND l.expiry_date BETWEEN ${today}::date AND ${addDays(today,7)}::date)::int AS "expiringLots"
        FROM inventory_lots l WHERE true ${lotScope}`);
      const [low] = await tx.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count FROM store_products sp JOIN products p ON p.id = sp.product_id
        JOIN locations loc ON loc.id = sp.location_id
        LEFT JOIN v_inventory_balance b ON b.location_id = sp.location_id AND b.product_id = sp.product_id
        WHERE sp.is_active = true AND p.is_active = true AND p.deleted_at IS NULL AND loc.deleted_at IS NULL AND loc.is_active = true
          AND COALESCE(b.current_quantity,0) <= COALESCE(sp.min_stock_level,0)
          ${locationId ? Prisma.sql`AND sp.location_id = ${locationId}::uuid` : Prisma.empty}`);
      const activeProducts = await tx.product.count({ where: { isActive: true, deletedAt: null, ...(locationId ? { OR: [
        { storeProducts: { some: { locationId, isActive: true } } }, { inventoryLots: { some: { locationId } } },
      ] } : {}) } });
      let storeComparison: (StoreRow & { grossProfit: string })[] | undefined;
      if (user.role === 'ADMIN') {
        const stores = await tx.$queryRaw<StoreRow[]>(Prisma.sql`
          WITH totals AS (SELECT s.location_id, SUM(s.total_amount) AS revenue FROM sales s
            WHERE s.status = 'COMPLETED' AND s.sold_at >= ${start} AND s.sold_at < ${end} GROUP BY s.location_id),
          lines AS (SELECT s.location_id, SUM(i.quantity) AS quantity, SUM(i.cost_of_goods_sold) AS cogs
            FROM sales s JOIN sale_items i ON i.sale_id = s.id
            WHERE s.status = 'COMPLETED' AND s.sold_at >= ${start} AND s.sold_at < ${end} GROUP BY s.location_id)
          SELECT loc.id, loc.code, loc.name, COALESCE(t.revenue,0)::text AS revenue, COALESCE(l.cogs,0)::text AS cogs, COALESCE(l.quantity,0)::text AS quantity
          FROM locations loc LEFT JOIN totals t ON t.location_id = loc.id LEFT JOIN lines l ON l.location_id = loc.id
          WHERE loc.location_type = 'STORE' AND loc.deleted_at IS NULL ORDER BY COALESCE(t.revenue,0) DESC, loc.code`);
        storeComparison = stores.map((store) => ({ ...store, grossProfit: profit(store.revenue, store.cogs) }));
      }
      return { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), locationId: locationId ?? null,
        metrics: { ...metrics!, grossProfit: profit(metrics!.revenue, metrics!.cogs), estimatedOperatingProfit: profit(metrics!.revenue, metrics!.cogs, metrics!.expenses) },
        trend, topProducts, ...(storeComparison ? { storeComparison } : {}),
        inventory: { asOf: today, ...stock!, value: new Prisma.Decimal(stock!.value).toFixed(2), activeProducts, lowStockPairs: low!.count, expiryWarningDays: 7 },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
  }
}
