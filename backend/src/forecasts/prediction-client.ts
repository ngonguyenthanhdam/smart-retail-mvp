import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { addDays } from '../inventory/expiry';
import type { HistoryPoint } from './forecast-history';

export class PredictionFailure extends Error {
  constructor(readonly code: 'MODEL_UNAVAILABLE' | 'INVALID_FORECAST_INPUT' | 'INSUFFICIENT_HISTORY' | 'PREDICTION_FAILED') { super(code); }
}
export type PredictionSeries = { store_id: string; product_id: string; history: HistoryPoint[] };
export type PredictionResult = { storeId: string; productId: string; total: Prisma.Decimal; daily: HistoryPoint[] };
export type ModelInfo = { model_version: string; algorithm: string; model_target_space: string; usage_mode: string;
  real_world_accuracy_verified: boolean; operational_units_supported: boolean; validation_source?: unknown; training?: unknown; validation?: unknown; limitations?: unknown };
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PredictionFailure('PREDICTION_FAILED');
  return value as Record<string, unknown>;
};

@Injectable()
export class PredictionClient {
  constructor(private readonly config: ConfigService) {}
  private url(path: string) { return `${this.config.getOrThrow<string>('ML_SERVICE_URL').replace(/\/$/, '')}${path}`; }
  async modelInfo(): Promise<ModelInfo> {
    try {
      const response = await fetch(this.url('/model-info'), { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Unavailable');
      const body = object(await response.json());
      if (typeof body.model_version !== 'string' || !body.model_version.length || body.model_version.length > 100
        || typeof body.algorithm !== 'string' || !body.algorithm.length || body.algorithm.length > 100
        || body.usage_mode !== 'STORE_HISTORY' || body.model_target_space !== 'base_unit_quantity'
        || body.operational_units_supported !== true || typeof body.real_world_accuracy_verified !== 'boolean') throw new Error('Incompatible model');
      return body as ModelInfo;
    } catch { throw new PredictionFailure('MODEL_UNAVAILABLE'); }
  }
  async predict(origin: string, days: number, series: PredictionSeries[], model?: ModelInfo): Promise<{ predictions: PredictionResult[]; clipped: number; model: ModelInfo }> {
    const info = model ?? await this.modelInfo();
    let response: Response;
    try {
      response = await fetch(this.url('/predict'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
        body: JSON.stringify({ usage_mode: 'STORE_HISTORY', origin, horizon_days: days, series }),
      });
    } catch { throw new PredictionFailure('MODEL_UNAVAILABLE'); }
    if (!response.ok) throw new PredictionFailure(response.status === 503 ? 'MODEL_UNAVAILABLE' : 'PREDICTION_FAILED');
    try {
      const text = await response.text();
      if (text.length > 4_000_000) throw new Error('Response too large');
      const body = object(JSON.parse(text));
      if (body.model_version !== info.model_version || body.algorithm !== info.algorithm || body.usage_mode !== 'STORE_HISTORY'
        || body.model_target_space !== 'base_unit_quantity' || body.operational_units_supported !== true
        || body.real_world_accuracy_verified !== info.real_world_accuracy_verified
        || body.origin !== origin || body.horizon_days !== days || !Array.isArray(body.predictions) || body.predictions.length !== series.length
        || !Number.isInteger(body.negative_predictions_clipped) || Number(body.negative_predictions_clipped) < 0
        || Number(body.negative_predictions_clipped) > series.length * days) throw new Error('Contract mismatch');
      const expected = new Set(series.map(s => `${s.store_id}/${s.product_id}`));
      const predictions = body.predictions.map(value => {
        const row = object(value); const key = `${String(row.store_id)}/${String(row.product_id)}`;
        if (!expected.delete(key) || !Array.isArray(row.daily) || row.daily.length !== days) throw new Error('Prediction keys mismatch');
        const daily = row.daily.map((v, index) => {
          const point = object(v);
          if (point.date !== addDays(origin, index + 1) || typeof point.quantity !== 'number' || !Number.isFinite(point.quantity)
            || point.quantity < 0 || point.quantity >= 10_000_000_000) throw new Error('Invalid daily prediction');
          return { date: point.date as string, quantity: point.quantity };
        });
        return { storeId: row.store_id as string, productId: row.product_id as string, daily,
          total: daily.reduce((sum, day) => sum.add(String(day.quantity)), new Prisma.Decimal(0)) };
      });
      return { predictions, clipped: Number(body.negative_predictions_clipped), model: info };
    } catch { throw new PredictionFailure('PREDICTION_FAILED'); }
  }
}
