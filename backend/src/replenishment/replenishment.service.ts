import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { bodyObject, choiceValue, optionalText, requiredText, uuidValue } from '../common/validation';
import { decimalValue } from '../common/decimal';
import { activeLocation, operationQuery, locationSelect, writeActor } from '../common/operations';
import { databaseError } from '../common/database-errors';
import { businessDate } from '../inventory/expiry';
import { AlertsService } from '../alerts/alerts.service';
import { PurchasesService } from '../purchases/purchases.service';
import { recommendedQuantity, stockSnapshot } from './stock-snapshot';
import { demandWindow } from '../forecasts/forecast-period';

const include = { location: { select: locationSelect }, product: { select: { id: true, sku: true, name: true, imageKey: true, purchaseToBaseRatio: true,
  baseUnit: { select: { code: true, name: true, symbol: true, allowFraction: true } }, purchaseUnit: { select: { code: true, name: true, symbol: true } } } },
  forecast: { select: { predictedQuantity: true, periodStart: true, periodEnd: true, createdAt: true, run: { select: { modelVersion: true, metrics: true } } } },
  purchaseOrder: { select: { id: true, orderNumber: true, status: true } } } as const;
type Row = Prisma.ReplenishmentRecommendationGetPayload<{ include: typeof include }>;
function present(row: Row) {
  const approved = row.decisionStatus === 'ADJUSTED' ? row.managerQuantity : row.recommendedQuantity;
  const ratio = row.product.purchaseToBaseRatio;
  const purchaseQuantity = approved && ratio?.gt(0) ? approved.div(ratio).ceil() : null;
  const metrics = row.forecast.run.metrics as { usageMode?: string; dataSource?: string } | null;
  return { ...row, usageMode: metrics?.usageMode ?? 'SYNTHETIC_DEMO', dataSource: metrics?.dataSource ?? 'SYNTHETIC', realWorldAccuracyVerified: false,
    forecast: { ...row.forecast, run: { modelVersion: row.forecast.run.modelVersion }, predictedQuantity: row.demandQuantitySnapshot ?? row.forecast.predictedQuantity,
      periodStart: row.demandPeriodStart ?? row.forecast.periodStart, periodEnd: row.demandPeriodEnd ?? row.forecast.periodEnd },
    incomingPolicy: 'DRAFT_EXCLUDED',
    expectedPurchaseQuantity: purchaseQuantity?.toFixed() ?? null, expectedBaseQuantity: purchaseQuantity && ratio ? purchaseQuantity.mul(ratio).toFixed() : null };
}
@Injectable()
export class ReplenishmentService {
  constructor(private readonly prisma: PrismaService, private readonly alerts: AlertsService, private readonly purchases: PurchasesService) {}
  async list(input: unknown, user: AuthenticatedUser) {
    const q = operationQuery(input,['PENDING','ACCEPTED','ADJUSTED','REJECTED']);
    const locationId = resolveLocationScope(user,q.requestedLocation);
    const where: Prisma.ReplenishmentRecommendationWhereInput = { ...(locationId ? { locationId } : {}), ...(q.status ? { decisionStatus: q.status } : {}),
      ...(q.search ? { product: { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { sku: { contains: q.search, mode: 'insensitive' } }] } } : {}) };
    return this.prisma.$transaction(async tx => ({ items: (await tx.replenishmentRecommendation.findMany({ where, include,
      orderBy: [{ forecast: { createdAt: 'desc' } }, { id: 'asc' }], skip: (q.page-1)*q.pageSize, take: q.pageSize })).map(present),
      total: await tx.replenishmentRecommendation.count({ where }), page: q.page, pageSize: q.pageSize,
      summary: {
        pending: await tx.replenishmentRecommendation.count({ where: { AND: [where, { decisionStatus: 'PENDING' }] } }),
        approved: await tx.replenishmentRecommendation.count({ where: { AND: [where, { decisionStatus: { in: ['ACCEPTED','ADJUSTED'] }, purchaseOrder: null }] } }),
        linked: await tx.replenishmentRecommendation.count({ where: { AND: [where, { purchaseOrder: { isNot: null } }] } }),
        rejected: await tx.replenishmentRecommendation.count({ where: { AND: [where, { decisionStatus: 'REJECTED' }] } }),
      } }), { isolationLevel: 'RepeatableRead' });
  }
  async detail(rawId: string, user: AuthenticatedUser) {
    const scope = resolveLocationScope(user);
    const row = await this.prisma.replenishmentRecommendation.findFirst({ where: { id: uuidValue(rawId), ...(scope ? { locationId: scope } : {}) }, include });
    if (!row) throw new NotFoundException('Recommendation not found.');
    return present(row);
  }
  async generate(input: unknown, user: AuthenticatedUser) {
    const body = bodyObject(input,['forecastRunId','locationId']); const forecastRunId = uuidValue(body.forecastRunId);
    try { return await this.prisma.$transaction(async tx => {
      const actor = await writeActor(tx,user);
      const scope = resolveLocationScope(actor,body.locationId === undefined ? undefined : uuidValue(body.locationId));
      const run = await tx.forecastRun.findFirst({ where: { id: forecastRunId, status: 'COMPLETED',
        ...(scope ? { forecasts: { some: { locationId: scope } } } : {}) } });
      if (!run) throw new NotFoundException('Chọn một kết quả dự báo đã hoàn tất của cửa hàng.');
      const forecasts = await tx.demandForecast.findMany({ where: { forecastRunId, ...(scope ? { locationId: scope } : {}) }, orderBy: { periodStart: 'asc' }, distinct: ['locationId', 'productId'] });
      let created = 0, reused = 0, skipped = 0;
      for (const forecast of forecasts) {
        if (await tx.replenishmentRecommendation.findUnique({ where: { demandForecastId: forecast.id } })) { reused++; continue; }
        const config = await tx.storeProduct.findFirst({ where: { locationId: forecast.locationId, productId: forecast.productId, isActive: true,
          location: { isActive: true, deletedAt: null, locationType: 'STORE' }, product: { isActive: true, deletedAt: null } }, include: { product: { include: { baseUnit: true } } } });
        const demand = demandWindow(run.dailyPredictions, forecast.locationId, forecast.productId, businessDate(), 30);
        if (!config?.product || !demand) { skipped++; continue; }
        const stock = await stockSnapshot(tx,forecast.locationId,forecast.productId,!!config.product.trackExpiry);
        const safety = config.safetyStock ?? new Prisma.Decimal(0);
        const rawRecommendation = recommendedQuantity(demand.quantity,safety,stock.current,stock.incoming);
        const recommendation = config.product.baseUnit?.allowFraction === false ? rawRecommendation.ceil() : rawRecommendation;
        await tx.replenishmentRecommendation.create({ data: { demandForecastId: forecast.id, locationId: forecast.locationId, productId: forecast.productId,
          currentStockSnapshot: stock.current, incomingStockSnapshot: stock.incoming, safetyStockSnapshot: safety,
          demandQuantitySnapshot: demand.quantity, demandPeriodStart: new Date(demand.start), demandPeriodEnd: new Date(demand.end),
          recommendedQuantity: recommendation, decisionStatus: 'PENDING' } });
        created++;
      }
      await this.alerts.evaluateTx(tx,scope);
      return { created, reused, skipped, operationalDays: 30, incomingPolicy: 'DRAFT_EXCLUDED' };
    }, { isolationLevel: 'Serializable', timeout: 30000 }); } catch (e) { databaseError(e,'Recommendations changed. Refresh before trying again.'); }
  }
  async decide(rawId: string, input: unknown, user: AuthenticatedUser) {
    const id = uuidValue(rawId); const body = bodyObject(input,['decision','managerQuantity','reason']);
    const decisionStatus = choiceValue(body.decision,['ACCEPTED','ADJUSTED','REJECTED'],'Decision');
    const managerQuantity = decisionStatus === 'ADJUSTED' ? decimalValue(body.managerQuantity,'Adjusted base quantity',4) : null;
    if (decisionStatus !== 'ADJUSTED' && body.managerQuantity !== undefined) throw new BadRequestException('Quantity is only supported when adjusting.');
    const decisionNote = decisionStatus === 'ADJUSTED' ? requiredText(body.reason,'Adjustment reason',4000) : optionalText(body.reason ?? null,'Reason',4000);
    try { return await this.prisma.$transaction(async tx => {
      const actor = await writeActor(tx,user); const scope = resolveLocationScope(actor);
      const row = await tx.replenishmentRecommendation.findFirst({ where: { id, ...(scope ? { locationId: scope } : {}) }, include });
      if (!row) throw new NotFoundException('Recommendation not found.');
      await activeLocation(tx,actor,row.locationId,true);
      if (managerQuantity && row.product.baseUnit?.allowFraction === false && !managerQuantity.isInteger()) {
        throw new BadRequestException('Đơn vị đếm yêu cầu số lượng điều chỉnh là số nguyên.');
      }
      if (row.decisionStatus !== 'PENDING') {
        if (row.decisionStatus === decisionStatus && row.managerQuantity?.toFixed() === managerQuantity?.toFixed() && row.decisionNote === decisionNote) return present(row);
        throw new ConflictException('This recommendation already has a decision. Refresh to review it.');
      }
      return present(await tx.replenishmentRecommendation.update({ where: { id }, data: { decisionStatus, managerQuantity, decisionNote, decidedBy: user.id, decidedAt: new Date() }, include }));
    }, { isolationLevel: 'Serializable' }); } catch (e) { databaseError(e); }
  }
  async purchase(rawId: string, input: unknown, user: AuthenticatedUser) {
    const id = uuidValue(rawId); const body = bodyObject(input,['unitCost']);
    try { return await this.prisma.$transaction(async tx => {
      const actor = await writeActor(tx,user); const scope = resolveLocationScope(actor);
      const row = await tx.replenishmentRecommendation.findFirst({ where: { id, ...(scope ? { locationId: scope } : {}) }, include });
      if (!row) throw new NotFoundException('Recommendation not found.');
      if (row.purchaseOrder) return row.purchaseOrder;
      if (!['ACCEPTED','ADJUSTED'].includes(row.decisionStatus)) throw new ConflictException('Accept or adjust this recommendation before creating a purchase draft.');
      await activeLocation(tx,actor,row.locationId,true);
      const config = await tx.storeProduct.findFirst({ where: { locationId: row.locationId, productId: row.productId, isActive: true, product: { isActive: true, deletedAt: null } } });
      if (!config) throw new BadRequestException('This product is no longer active in the store.');
      const approved = row.decisionStatus === 'ADJUSTED' ? row.managerQuantity! : row.recommendedQuantity;
      if (!approved.gt(0)) throw new BadRequestException('A zero approved quantity does not require a purchase.');
      const ratio = row.product.purchaseToBaseRatio;
      if (!ratio?.gt(0)) throw new BadRequestException('The product needs a valid purchase conversion.');
      const quantity = decimalValue(approved.div(ratio).ceil().toFixed(),'Purchase quantity',4,true);
      return this.purchases.createDraft(tx,{ locationId: row.locationId, orderedAt: new Date().toISOString(),
        note: `Đề xuất nhập đã được người quản lý xem xét. Phiên bản ${row.forecast.run.modelVersion}. Dự báo hỗ trợ quyết định; không bảo đảm lượng bán thực tế.`,
        items: [{ productId: row.productId, purchaseQuantity: quantity.toFixed(), unitCost: body.unitCost }] },user,id);
    }, { isolationLevel: 'Serializable', timeout: 15000 }); } catch (e) { databaseError(e,'A purchase already exists or the recommendation changed. Refresh to open the linked order.'); }
  }
}
