import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma, type ForecastRun } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { bodyObject, uuidValue } from '../common/validation';
import { decimalValue } from '../common/decimal';
import { ForecastHistory, seriesAt } from './forecast-history';
import { PredictionClient, PredictionFailure } from './prediction-client';
import { AlertsService } from '../alerts/alerts.service';
import { calendarMonths, predictionDays, savedSeries } from './forecast-period';

type Skipped = { locationId: string; productId: string; store: string; product: string; reason: string };
type RunMetrics = { usageMode?: string; origin?: string; locationId?: string | null; skipped?: Skipped[]; errorCode?: string | null;
  modelInfo?: unknown; dataSource?: string; periodKind?: string; realWorldAccuracyVerified?: boolean };
const forecastSelect = { id: true, locationId: true, productId: true, periodStart: true, periodEnd: true,
  predictedQuantity: true, estimatedUnitPrice: true, predictedRevenue: true, createdAt: true,
  location: { select: { id: true, code: true, name: true } },
  product: { select: { id: true, sku: true, name: true, imageKey: true, baseUnit: { select: { code: true, name: true, symbol: true, allowFraction: true } } } },
} as const;

@Injectable()
export class ForecastsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly history: ForecastHistory, private readonly client: PredictionClient, private readonly alerts: AlertsService) {}
  async onModuleInit() {
    // This MVP runs one backend instance. A restart interrupts synchronous requests.
    await this.prisma.forecastRun.updateMany({ where: { status: { in: ['PENDING', 'RUNNING'] } }, data: { status: 'FAILED', completedAt: new Date() } });
  }
  private scope(input: unknown, user: AuthenticatedUser) {
    const query = bodyObject(input, ['locationId']);
    return resolveLocationScope(user, query.locationId === undefined ? undefined : uuidValue(query.locationId));
  }
  private readable(locationId?: string): Prisma.ForecastRunWhereInput {
    return locationId ? { OR: [{ forecasts: { some: { locationId } } }, { metrics: { path: ['locationId'], equals: locationId } }] } : {};
  }
  private present(run: ForecastRun, locationId?: string) {
    const metrics = (run.metrics ?? {}) as RunMetrics;
    return { id: run.id, modelVersion: run.modelVersion, algorithm: run.algorithm, horizonMonths: run.horizonMonths,
      status: run.status, startedAt: run.startedAt, completedAt: run.completedAt, origin: metrics.origin ?? null,
      usageMode: metrics.usageMode ?? 'SYNTHETIC_DEMO', realWorldAccuracyVerified: metrics.realWorldAccuracyVerified ?? false,
      modelInfo: metrics.modelInfo ?? null, dataSource: metrics.dataSource ?? 'SYNTHETIC', periodKind: metrics.periodKind ?? 'LEGACY_ROLLING_DAYS',
      errorCode: run.status === 'FAILED' ? metrics.errorCode ?? 'PREDICTION_FAILED' : null,
      skipped: (metrics.skipped ?? []).filter((pair) => !locationId || pair.locationId === locationId) };
  }
  async list(input: unknown, user: AuthenticatedUser) {
    const locationId = this.scope(input, user);
    const runs = await this.prisma.forecastRun.findMany({ where: this.readable(locationId), orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 20,
      include: { _count: { select: { forecasts: { where: locationId ? { locationId } : {} } } } } });
    return { items: runs.map((run) => ({ ...this.present(run, locationId), forecastCount: run._count.forecasts })) };
  }
  async detail(rawId: unknown, input: unknown, user: AuthenticatedUser) {
    const id = uuidValue(rawId); const locationId = this.scope(input, user);
    const run = await this.prisma.forecastRun.findFirst({ where: { id, ...this.readable(locationId) },
      include: { forecasts: { where: locationId ? { locationId } : {}, select: forecastSelect,
        orderBy: [{ locationId: 'asc' }, { productId: 'asc' }, { periodStart: 'asc' }] } } });
    if (!run) throw new NotFoundException('Forecast run not found.');
    return { ...this.present(run, locationId), forecasts: run.forecasts,
      dailySeries: savedSeries(run.dailyPredictions).filter(s => !locationId || s.locationId === locationId) };
  }
  async create(input: unknown, user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Only ADMIN may run forecasts.');
    const body = bodyObject(input, ['locationId', 'horizonMonths']);
    if (body.horizonMonths !== 1 && body.horizonMonths !== 3) throw new BadRequestException('INVALID_FORECAST_INPUT: choose a one- or three-month horizon.');
    const locationId = body.locationId === undefined ? undefined : uuidValue(body.locationId);
    if (locationId && !await this.prisma.location.findFirst({ where: { id: locationId, isActive: true, deletedAt: null, locationType: 'STORE' } })) {
      throw new BadRequestException('INVALID_FORECAST_INPUT: select an active store.');
    }
    const snapshot = await this.history.snapshot(locationId); const { eligible, skipped } = seriesAt(snapshot);
    const periods = calendarMonths(snapshot.origin, body.horizonMonths);
    const days = predictionDays(snapshot.origin, body.horizonMonths);
    const sources = [...new Set(eligible.map(p => p.dataSource))];
    const metrics = { usageMode: 'STORE_HISTORY', realWorldAccuracyVerified: false, modelTargetSpace: 'base_unit_quantity',
      periodKind: 'CALENDAR_MONTH', dataSource: sources.length > 1 ? 'MIXED' : sources[0] ?? 'UNKNOWN',
      origin: snapshot.origin, locationId: locationId ?? null, horizonDays: days, calendarPeriods: periods, operationalWindowDays: 30, skipped, errorCode: null };
    const run = await this.prisma.forecastRun.create({ data: { modelVersion: 'pending', algorithm: 'pending',
      horizonMonths: body.horizonMonths, metrics, status: 'RUNNING', requestedBy: user.id, startedAt: new Date() } });
    try {
      if (!eligible.length) throw new PredictionFailure(skipped.some((p) => p.reason === 'INVALID_FORECAST_INPUT') ? 'INVALID_FORECAST_INPUT' : 'INSUFFICIENT_HISTORY');
      const result = await this.client.predict(snapshot.origin, days, eligible.map((pair) => ({ store_id: pair.locationId, product_id: pair.productId, history: pair.history })));
      const prices = new Map(eligible.map((pair) => [`${pair.locationId}/${pair.productId}`, pair.sellingPrice]));
      const forecasts = result.predictions.flatMap((prediction) => periods.map(period => {
        const price = prices.get(`${prediction.storeId}/${prediction.productId}`)!;
        const total = prediction.daily.filter(d => d.date >= period.start && d.date <= period.end)
          .reduce((sum, d) => sum.add(String(d.quantity)), new Prisma.Decimal(0));
        const quantity = decimalValue(total.toFixed(4), 'Predicted quantity', 4);
        const revenue = decimalValue(quantity.mul(price).toFixed(2), 'Predicted revenue', 2);
        return { forecastRunId: run.id, locationId: prediction.storeId, productId: prediction.productId,
          periodStart: new Date(period.start), periodEnd: new Date(period.end),
          predictedQuantity: quantity, estimatedUnitPrice: price, predictedRevenue: revenue, createdAt: new Date() };
      }));
      const dailyPredictions = result.predictions.map(p => {
        const pair = eligible.find(e => e.locationId === p.storeId && e.productId === p.productId)!;
        return { locationId: p.storeId, productId: p.productId, dataSource: pair.dataSource, daily: p.daily, history: pair.history };
      });
      await this.prisma.$transaction(async (tx) => {
        if (!await tx.user.findFirst({ where: { id: user.id, isActive: true, deletedAt: null, role: { code: 'ADMIN' } } })) {
          throw new ForbiddenException('Administrator access changed.');
        }
        const active = await tx.storeProduct.count({ where: { isActive: true, OR: eligible.map((p) => ({ locationId: p.locationId, productId: p.productId })),
          location: { isActive: true, deletedAt: null, locationType: 'STORE' }, product: { isActive: true, deletedAt: null } } });
        if (active !== eligible.length) throw new PredictionFailure('INVALID_FORECAST_INPUT');
        await tx.demandForecast.createMany({ data: forecasts });
        await tx.forecastRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', completedAt: new Date(),
          modelVersion: result.model.model_version, algorithm: result.model.algorithm, dailyPredictions,
          metrics: { ...metrics, modelInfo: JSON.parse(JSON.stringify(result.model)) as Prisma.InputJsonValue,
            negativePredictionsClipped: result.clipped } } });
        await this.alerts.evaluateTx(tx,locationId);
      }, { isolationLevel: 'Serializable', timeout: 30000 });
    } catch (error) {
      const code = error instanceof PredictionFailure ? error.code : 'PREDICTION_FAILED';
      await this.prisma.forecastRun.update({ where: { id: run.id }, data: { status: 'FAILED', completedAt: new Date(), metrics: { ...metrics, errorCode: code } } });
      if (error instanceof ForbiddenException) throw error;
    }
    return this.detail(run.id, {}, user);
  }
}
