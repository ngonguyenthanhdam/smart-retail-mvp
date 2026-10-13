import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../src/database/prisma.service';
import { ForecastHistory, seriesAt } from '../src/forecasts/forecast-history';
import { PredictionClient } from '../src/forecasts/prediction-client';
import { DEMO_NOTICE, MODEL_VERSION } from '../src/forecasts/demo-source';
import { addDays } from '../src/inventory/expiry';

type Observation = { storeId: string; productId: string; date: string; unit: string; actual: number; predicted: number };
function metrics(rows: Observation[]) {
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const absolute = rows.reduce((sum, row) => sum + Math.abs(row.actual-row.predicted), 0);
  const squared = rows.reduce((sum, row) => sum + (row.actual-row.predicted)**2, 0);
  return { rows: rows.length, WAPE: actual ? absolute/actual : null, MAE: absolute/rows.length, RMSE: Math.sqrt(squared/rows.length),
    actualQuantity: actual, predictedQuantity: rows.reduce((sum, row) => sum + row.predicted,0) };
}

async function main() {
  const config = new ConfigService({ DATABASE_URL: process.env.DATABASE_URL, ML_SERVICE_URL: process.env.ML_SERVICE_URL ?? 'http://localhost:8000' });
  const prisma = new PrismaService(config);
  const modelRoot = resolve(__dirname, '../../../ml-service');
  try {
    await prisma.onModuleInit();
    const snapshot = await new ForecastHistory(prisma).snapshot();
    if (!snapshot.coverageVerified || !snapshot.daily.length) throw new Error('Synthetic seed is required.');
    const outcomes = []; const allRows: (Observation & { horizon: number })[] = [];
    for (const days of [7,30]) {
      const origin = addDays(snapshot.origin,-days);
      const { eligible, skipped } = seriesAt(snapshot,origin);
      if (!eligible.length) throw new Error('No synthetic series eligible for backtest.');
      const prediction = await new PredictionClient(config).predict(origin,days,eligible.map((p) => ({ store_id: p.locationId, product_id: p.productId, history: p.history })));
      const actuals = new Map(snapshot.daily.map((row) => [`${row.locationId}/${row.productId}/${row.date}`,Number(row.quantity)]));
      const units = new Map(eligible.map((p) => [`${p.locationId}/${p.productId}`,p.product!.baseUnit!.symbol ?? p.product!.baseUnit!.code]));
      const rows: Observation[] = prediction.predictions.flatMap((p) => p.daily.map((day) => ({ storeId: p.storeId, productId: p.productId,
        date: day.date, unit: units.get(`${p.storeId}/${p.productId}`)!, actual: actuals.get(`${p.storeId}/${p.productId}/${day.date}`) ?? 0, predicted: day.quantity })));
      allRows.push(...rows.map((row) => ({ ...row, horizon: days })));
      outcomes.push({ origin, historyInputDays: 30, historyAvailableDays: 90-days, targetStart: addDays(origin,1), targetEnd: snapshot.origin,
        horizonDays: days, eligibleSeries: eligible.length, skipped, negativePredictionsClipped: prediction.clipped,
        byBaseUnit: [...new Set(rows.map((row) => row.unit))].sort().map((unit) => {
          const group = rows.filter((r) => r.unit === unit); const first = group[0]!;
          return { unit, series: new Set(group.map((r) => `${r.storeId}/${r.productId}`)).size, ...metrics(group),
            example: group.filter((r) => r.storeId === first.storeId && r.productId === first.productId).slice(0,7) };
        }) });
    }
    const artifactHash = createHash('sha256').update(await readFile(resolve(modelRoot,'models/demand_model.joblib'))).digest('hex');
    const report = { notice: DEMO_NOTICE, generatedAt: new Date().toISOString(), modelVersion: MODEL_VERSION, artifactSha256: artifactHash,
      method: 'Fixed-origin synthetic quantity backtest through the same NestJS history builder and HTTP FastAPI predictor. No fit, scaling coefficient or held-out actual feedback.',
      modelTargetSpace: 'freshretailnet_normalized', realWorldAccuracyVerified: false, quantityInterpretation: 'Uncalibrated direct numeric transfer to synthetic base-unit series; technical demonstration only.',
      outcomes };
    await mkdir(resolve(modelRoot,'data/processed/retailsense-demo'),{ recursive: true });
    await writeFile(resolve(modelRoot,'data/processed/retailsense-demo/backtest_predictions.json'),JSON.stringify(allRows)+'\n');
    await writeFile(resolve(modelRoot,'reports/retailsense_demo_backtest.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({ notice: report.notice, outcomes: outcomes.map((o) => ({ ...o, skipped: o.skipped.length,
      byBaseUnit: o.byBaseUnit.map((score) => Object.fromEntries(Object.entries(score).filter(([key]) => key !== 'example'))) })) },null,2));
  } finally { await prisma.$disconnect(); }
}
void main().catch(() => { console.error('Synthetic backtest failed. Verify demo seed, model service and private local configuration.'); process.exitCode = 1; });
