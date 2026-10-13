import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { bodyObject, choiceValue, uuidValue } from '../common/validation';
import { operationQuery, locationSelect, writeActor } from '../common/operations';
import { databaseError } from '../common/database-errors';
import { addDays, businessDate } from '../inventory/expiry';
import { stockSnapshot } from '../replenishment/stock-snapshot';
import { demandWindow } from '../forecasts/forecast-period';

const types = ['STOCKOUT_RISK','OVERSTOCK_RISK','EXPIRY_RISK'] as const;
const alertInclude = {
  location: { select: locationSelect },
  product: { select: { id: true, name: true, sku: true, imageKey: true, baseUnit: { select: { code: true, name: true, symbol: true, allowFraction: true } } } },
  lot: { select: { lotNumber: true, expiryDate: true, quantityOnHand: true } },
} as const;
@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(input: unknown, user: AuthenticatedUser) {
    const q = operationQuery(input, ['OPEN','RESOLVED'], ['alertType']);
    const locationId = resolveLocationScope(user,q.requestedLocation);
    const where: Prisma.InventoryAlertWhereInput = { ...(locationId ? { locationId } : {}), ...(q.status ? { status: q.status } : {}),
      ...(q.query.alertType ? { alertType: choiceValue(q.query.alertType,types,'Alert type') } : {}),
      ...(q.search ? { product: { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { sku: { contains: q.search, mode: 'insensitive' } }] } } : {}) };
    return this.prisma.$transaction(async tx => {
      const groups = await tx.inventoryAlert.groupBy({ by: ['status','severity','alertType'], where, _count: true });
      const count = (match: (g: typeof groups[number]) => boolean) => groups.filter(match).reduce((n,g) => n + g._count, 0);
      // Page across priority buckets, so critical rows on later pages cannot be hidden by date sorting.
      let skip = (q.page - 1) * q.pageSize;
      const items: Prisma.InventoryAlertGetPayload<{ include: typeof alertInclude }>[] = [];
      for (const status of ['OPEN','RESOLVED']) for (const severity of ['CRITICAL','HIGH','MEDIUM','LOW']) {
        if (items.length >= q.pageSize) break;
        const size = count(g => g.status === status && g.severity === severity);
        if (skip >= size) { skip -= size; continue; }
        items.push(...await tx.inventoryAlert.findMany({ where: { AND: [where, { status, severity }] }, include: alertInclude,
          orderBy: [{ detectedAt: 'desc' }, { id: 'asc' }], skip, take: q.pageSize - items.length }));
        skip = 0;
      }
      return { items, total: count(() => true), page: q.page, pageSize: q.pageSize, businessDate: businessDate(),
        summary: { open: count(g => g.status === 'OPEN'), urgent: count(g => g.status === 'OPEN' && ['HIGH','CRITICAL'].includes(g.severity)),
          expiry: count(g => g.status === 'OPEN' && g.alertType === 'EXPIRY_RISK'), resolved: count(g => g.status === 'RESOLVED') } };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async evaluate(input: unknown, user: AuthenticatedUser) {
    const body = bodyObject(input,['locationId']);
    try { return await this.prisma.$transaction(async tx => {
      const actor = await writeActor(tx,user);
      const scope = resolveLocationScope(actor,body.locationId === undefined ? undefined : uuidValue(body.locationId));
      return this.evaluateTx(tx,scope);
    }, { isolationLevel: 'Serializable', timeout: 30000 }); } catch (e) { databaseError(e,'Alerts changed. Refresh and try again.'); }
  }
  async evaluateTx(tx: Prisma.TransactionClient, locationId?: string) {
    const today = businessDate(); const now = new Date();
    const configurations = await tx.storeProduct.findMany({ where: { ...(locationId ? { locationId } : {}), isActive: true,
      location: { locationType: 'STORE', isActive: true, deletedAt: null }, product: { isActive: true, deletedAt: null } }, include: { product: { include: { baseUnit: true } } } });
    const pairs = configurations.map(c => ({ locationId: c.locationId, productId: c.productId, product: c.product, safetyStock: c.safetyStock, minStockLevel: c.minStockLevel, forecastEnabled: true }));
    // Expiry remains relevant even when a stocked product is disabled or unconfigured.
    const stocked = await tx.inventoryLot.findMany({ where: { ...(locationId ? { locationId } : {}), quantityOnHand: { gt: 0 },
      location: { locationType: 'STORE', isActive: true, deletedAt: null } }, distinct: ['locationId','productId'], include: { product: { include: { baseUnit: true } } } });
    for (const lot of stocked) if (!pairs.some(p => p.locationId === lot.locationId && p.productId === lot.productId)) {
      pairs.push({ locationId: lot.locationId, productId: lot.productId, product: lot.product, safetyStock: new Prisma.Decimal(0), minStockLevel: new Prisma.Decimal(0), forecastEnabled: false });
    }
    const activeIds: string[] = [];
    for (const config of pairs) {
      if (!config.locationId || !config.productId || !config.product) continue;
      const pair = { locationId: config.locationId, productId: config.productId };
      const snapshot = await stockSnapshot(tx,pair.locationId,pair.productId,!!config.product.trackExpiry,today);
      const total = snapshot.current.add(snapshot.incoming); const safety = config.safetyStock ?? new Prisma.Decimal(0);
      const unit = config.product.baseUnit?.symbol ?? config.product.baseUnit?.code ?? '';
      const estimateDigits = config.product.baseUnit?.allowFraction === false ? 0 : 1;
      const exact = (value: Prisma.Decimal) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(value.toNumber())} ${unit}`;
      const estimate = (value: Prisma.Decimal) => value.gt(0) && value.lt(10 ** -estimateDigits / 2)
        ? `< ${exact(new Prisma.Decimal(10 ** -estimateDigits))}`
        : `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: estimateDigits }).format(value.toNumber())} ${unit}`;
      for (const alertType of types) {
        let condition = false, message = '', severity = 'MEDIUM';
        let demandForecastId: string | null = null, inventoryLotId: string | null = null;
        if (alertType === 'EXPIRY_RISK') {
          const lots = snapshot.lots.filter(l => l.expiryDate && l.expiryDate.toISOString().slice(0,10) <= addDays(today,30))
            .sort((a,b) => a.expiryDate!.getTime()-b.expiryDate!.getTime() || a.id.localeCompare(b.id));
          if (lots.length) { condition = true; inventoryLotId = lots[0]!.id;
            const expired = lots[0]!.expiryDate!.toISOString().slice(0,10) < today; severity = expired ? 'HIGH' : 'MEDIUM';
            message = `${lots.length} lô còn hàng đã hết hạn hoặc sẽ hết hạn trong 30 ngày. Hạn sớm nhất: ${lots[0]!.expiryDate!.toISOString().slice(0,10)}${expired ? ' (đã hết hạn)' : ''}. Kiểm tra hàng tồn theo lô.`; }
        } else if (config.forecastEnabled) {
          const days = alertType === 'STOCKOUT_RISK' ? 30 : 90;
          const forecasts = await tx.demandForecast.findMany({ where: { ...pair, periodEnd: { gte: new Date(today) }, run: { status: 'COMPLETED' } },
            include: { run: { select: { dailyPredictions: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30 });
          const matching = forecasts.map(f => ({ forecast: f, demand: demandWindow(f.run.dailyPredictions, pair.locationId, pair.productId, today, days) })).find(f => f.demand);
          if (matching?.demand) {
            const target = matching.demand.quantity.add(safety);
            condition = days === 30 ? total.lt(target) : total.gt(target); demandForecastId = matching.forecast.id;
            severity = days === 30 ? 'HIGH' : 'LOW';
            message = `${days === 30 ? 'Nguy cơ thiếu hàng trong 30 ngày' : 'Khả năng dư hàng theo kế hoạch 90 ngày'}: tồn còn bán được ${exact(total)}; nhu cầu ước tính và tồn an toàn khoảng ${estimate(target)}. Phiếu nhập nháp chưa tính là hàng đang về.${matching.demand.dataSource === 'SYNTHETIC' ? ' Dựa trên dữ liệu mô phỏng.' : ''}`;
          } else if (days === 30 && config.minStockLevel?.gt(0) && snapshot.current.lte(config.minStockLevel)) {
            condition = true; severity = 'MEDIUM';
            message = `Tồn còn bán được ${exact(snapshot.current)} bằng hoặc thấp hơn mức tối thiểu ${exact(config.minStockLevel)}. Chưa có dự báo bao phủ đủ 30 ngày; cảnh báo theo mức tồn đã cấu hình.`;
          }
        }
        if (!condition) continue;
        const key = { ...pair, alertType };
        const previous = await tx.inventoryAlert.findUnique({ where: { locationId_productId_alertType: key } });
        const alert = await tx.inventoryAlert.upsert({ where: { locationId_productId_alertType: key },
          create: { ...key, message, severity, status: 'OPEN', detectedAt: now, demandForecastId, inventoryLotId },
          update: { message, severity, status: 'OPEN', resolvedAt: null, demandForecastId, inventoryLotId, ...(previous?.status !== 'OPEN' ? { detectedAt: now } : {}) } });
        activeIds.push(alert.id);
      }
    }
    const resolved = await tx.inventoryAlert.updateMany({ where: { ...(locationId ? { locationId } : {}), status: 'OPEN', id: { notIn: activeIds } }, data: { status: 'RESOLVED', resolvedAt: now } });
    return { open: activeIds.length, resolved: resolved.count, evaluatedAt: now };
  }
}
