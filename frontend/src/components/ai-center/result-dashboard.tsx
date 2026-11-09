'use client';
import { useFormatters } from '@/i18n/formatters';
import { useDynamic } from '@/i18n/dynamic';
import { useScreen } from '@/i18n/provider';
import { useState, type ReactNode } from 'react';
import type { TrainingResult } from './types';
import { Badge, ChartInteraction, DataTable, LineChart, numberText } from './shared';

type Metric = { mae: number; rmse: number; wape: number | null; bias: number | null };
const shortDate = (date: string) => date.slice(5).split('-').reverse().join('/');

const format = (value: number | null | undefined, percent = false) =>
  value == null
    ? '—'
    : (percent ? value * 100 : value).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) +
      (percent ? '%' : '');
function Chart({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <figure className="ai-chart ai-analysis-chart">
      <figcaption>{title}</figcaption>
      <p className="field-hint">{note}</p>
      <ChartInteraction>{children}</ChartInteraction>
    </figure>
  );
}
function Heatmap({
  title,
  rows,
  columns,
  values,
  diverging = false,
}: {
  title: string;
  rows: string[];
  columns: string[];
  values: (number | null)[][];
  diverging?: boolean;
}) {
  const { t } = usePageCopy();
  const cellWidth = Math.min(38, 420 / Math.max(1, columns.length));
  const width = 145 + columns.length * cellWidth;
  const height = 75 + rows.length * 25;
  return (
    <div className="ai-heatmap-scroll">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ minWidth: 420 }}
        role="img"
        aria-label={title}
      >
        {rows.map((row, y) => (
          <g key={row}>
            <text x="128" y={42 + y * 25} textAnchor="end">
              {row}
            </text>
            {columns.map((column, x) => {
              const value = values[y]?.[x] ?? null;
              const intensity = Math.min(1, Math.abs(value ?? 0) / (diverging ? 1 : 100));
              const color =
                value === null
                  ? '#e5e7eb'
                  : `hsl(${diverging && value < 0 ? 15 : 157} ${32 + intensity * 24}% ${96 - intensity * 61}%)`;
              return (
                <rect
                  data-point
                  tabIndex={0}
                  key={column + x}
                  x={138 + x * cellWidth}
                  y={26 + y * 25}
                  width={cellWidth - 2}
                  height="23"
                  rx="3"
                  fill={color}
                  aria-label={`${row}, ${column}: ${value === null ? t.undefined : format(value) + (diverging ? '' : '%')}`}
                >
                  <title>
                    {row} · {column}:{' '}
                    {value === null
                      ? t.undefinedConstantOrInsufficientSamples
                      : format(value) + (diverging ? '' : '%')}
                  </title>
                </rect>
              );
            })}
          </g>
        ))}
        {columns.map(
          (column, i) =>
            (columns.length <= 10 || i === 0 || i === columns.length - 1) && (
              <text
                key={column + i}
                x={138 + (i + 0.5) * cellWidth}
                y={rows.length * 25 + 45}
                textAnchor="middle"
              >
                {diverging ? i + 1 : shortDate(column)}
              </text>
            ),
        )}
      </svg>
      <div className="ai-chart-legend">
        {diverging
          ? t.orangeNegativeWhiteNearZeroGreenPositive
          : t.whiteCompleteData0MissingDarkGreen}
      </div>
      <div className={`ai-scale ${diverging ? 'diverging' : ''}`}>
        <span>{diverging ? '−1' : t.label0Missing}</span>
        <i />
        <span>{diverging ? '+1' : t.label100Missing}</span>
      </div>
      <details>
        <summary>{t.viewSourceFigures}</summary>
        <DataTable
          rows={rows.map((label, y) =>
            Object.fromEntries([
              [t.feature, label],
              ...columns.map((column, x) => [column, values[y]?.[x]]),
            ]),
          )}
        />
      </details>
    </div>
  );
}
function Calendar({ daily, unit }: { daily: { date: string; quantity: number }[]; unit: string }) {
  const dynamic = useDynamic();
  const { t } = usePageCopy();
  const points = daily.slice(-182);
  const start = points[0]?.date;
  if (!start) return <p>{t.noDailyDataYet}</p>;
  const offset = (new Date(start).getUTCDay() + 6) % 7;
  const max = Math.max(1, ...points.map((p) => p.quantity));
  const weeks = Math.ceil((points.length + offset) / 7);
  const width = Math.max(460, weeks * 19 + 55);
  return (
    <Chart
      title={t.salesCalendar}
      note={dynamic.calendarNote(unit, points[0].date, points.at(-1)!.date)}
    >
      <div className="ai-heatmap-scroll">
        <svg
          viewBox={`0 0 ${width} 192`}
          style={{ minWidth: 420 }}
          role="img"
          aria-label={dynamic.calendarLabel(unit)}
        >
          {t.weekdays.map((d, i) => (
            <text key={d} x="3" y={41 + i * 19}>
              {d}
            </text>
          ))}
          {points.map((p, i) => {
            const week = Math.floor((i + offset) / 7);
            const day = (i + offset) % 7;
            return (
              <g key={p.date}>
                {(i === 0 || p.date.endsWith('-01')) && (
                  <text x={35 + week * 19} y="14">
                    {p.date.slice(5, 7)}/{p.date.slice(0, 4)}
                  </text>
                )}
                <rect
                  data-point
                  tabIndex={0}
                  aria-label={`${p.date}: ${numberText(p.quantity)} ${unit}`}
                  x={35 + week * 19}
                  y={28 + day * 19}
                  width="16"
                  height="16"
                  rx="3"
                  fill={`hsl(157 40% ${96 - (60 * p.quantity) / max}%)`}
                >
                  <title>
                    {p.date}: {numberText(p.quantity)} {unit}
                  </title>
                </rect>
              </g>
            );
          })}
          <text x="35" y="181">
            {shortDate(start)}
          </text>
          <text x={35 + (weeks - 1) * 19} y="181" textAnchor="end">
            {shortDate(points.at(-1)!.date)}
          </text>
        </svg>
        <div className="ai-scale">
          <span>0 {unit}</span>
          <i />
          <span>
            {format(max)} {unit}
          </span>
        </div>
      </div>
      <details>
        <summary>{t.salesCalendarFigures}</summary>
        <DataTable
          rows={points.map((p) => ({
            [t.date]: p.date,
            [dynamic.salesQuantity(unit)]: p.quantity,
          }))}
        />
      </details>
    </Chart>
  );
}
function Density({
  points,
  unit,
}: {
  points: { actual: number; predicted: number }[];
  unit: string;
}) {
  const dynamic = useDynamic();
  const { t } = usePageCopy();
  if (!points.length)
    return <p className="field-hint">{t.noForecastSamplesAvailableForDensityAnalysis}</p>;
  const max = Math.max(1, ...points.flatMap((p) => [p.actual, p.predicted]));
  const bins = Array.from({ length: 10 }, () => Array<number>(10).fill(0));
  points.forEach(
    (p) =>
      bins[Math.min(9, Math.floor((p.predicted / max) * 10))][
        Math.min(9, Math.floor((p.actual / max) * 10))
      ]++,
  );
  const peak = Math.max(1, ...bins.flat());
  return (
    <Chart title={t.actualForecastDensity} note={dynamic.densityNote(points.length, unit)}>
      <svg viewBox="0 0 430 285" role="img" aria-label={t.actualAndForecastDensity}>
        <text x="15" y="15">
          {t.forecast}
          {unit})
        </text>
        {bins.map((row, y) =>
          row.map((count, x) => (
            <rect
              data-point
              key={`${x}-${y}`}
              tabIndex={0}
              x={55 + x * 30}
              y={25 + (9 - y) * 22}
              width="29"
              height="21"
              fill={count ? `hsl(157 42% ${92 - (55 * count) / peak}%)` : '#f2f5f3'}
            >
              <title>
                {count} {t.pointsActual} {format((x * max) / 10)}–{format(((x + 1) * max) / 10)}
                {t.forecast2} {format((y * max) / 10)}–{format(((y + 1) * max) / 10)}
              </title>
            </rect>
          )),
        )}
        <line x1="55" y1="245" x2="355" y2="25" stroke="#b36a32" strokeDasharray="4 4" />
        <text x="36" y="245">
          0
        </text>
        <text x="36" y="33" textAnchor="end">
          {format(max)}
        </text>
        <text x="355" y="263" textAnchor="end">
          {format(max)}
        </text>
        <text x="180" y="282">
          {t.actual}
          {unit})
        </text>
      </svg>
      <div className="ai-scale">
        <span>{t.label0Points}</span>
        <i />
        <span>
          {peak} {t.pointsCell}
        </span>
      </div>
      <details>
        <summary>{t.viewSamplePoints}</summary>
        <DataTable
          rows={points.map((p) => ({
            [t.actual2]: p.actual,
            [t.forecast3]: p.predicted,
            [t.unit]: unit,
          }))}
        />
      </details>
    </Chart>
  );
}
export function ResultDashboard({ result }: { result: TrainingResult }) {
  const { formatUnit } = useFormatters();
  const dynamic = useDynamic();
  const { t, featureName } = usePageCopy();
  const [advanced, setAdvanced] = useState('calendar');
  const [unitChoice, setUnit] = useState('');
  const [horizonChoice, setHorizon] = useState('7');
  const [algorithm, setAlgorithm] = useState(result.metadata.algorithm);
  const [pair, setPair] = useState('');
  const { evaluation, eda } = result;
  const units = Object.keys(eda.by_unit);
  const unit = units.includes(unitChoice) ? unitChoice : units[0];
  const displayUnit = formatUnit(unit);
  const horizon = evaluation.protocol.horizons.map(String).includes(horizonChoice)
    ? horizonChoice
    : String(evaluation.protocol.horizons[0]);
  const metrics = Object.entries(evaluation.test).map(([model, windows]) => ({
    model,
    metric: (windows[horizon]?.by_unit as Record<string, { daily: Metric }> | undefined)?.[unit]
      ?.daily,
  }));
  const ranked = [...metrics].sort(
    (a, b) => (a.metric?.wape ?? Infinity) - (b.metric?.wape ?? Infinity),
  );
  const chosen = metrics.find((m) => m.model === algorithm)?.metric;
  const all = evaluation.diagnostics?.[algorithm]?.samples ?? [];
  const samples = all.filter(
    (p) =>
      p.unit === unit &&
      p.date <=
        new Date(Date.parse(evaluation.protocol.test_origin) + Number(horizon) * 86400000)
          .toISOString()
          .slice(0, 10),
  );
  const pairs = [...new Set(samples.map((p) => JSON.stringify([p.store_id, p.product_id])))];
  const selected = pairs.includes(pair) ? pair : pairs[0];
  const points = samples.filter((p) => JSON.stringify([p.store_id, p.product_id]) === selected);
  const features = eda.feature_diagnostics?.by_unit[unit];
  const byUnit = eda.by_unit[unit];
  const maxWape = Math.max(0.01, ...metrics.map((m) => m.metric?.wape ?? 0));
  return (
    <div className="ai-dashboard">
      <div className="ai-result-heading">
        <div>
          <span className="ai-eyebrow">{t.selectedModel}</span>
          <h3>{result.metadata.algorithm}</h3>
          <p className="field-hint ai-version">{result.metadata.model_version}</p>
        </div>
        <div className="ai-row">
          <Badge status="COMPLETED" />
          {result.metadata.contains_synthetic && (
            <span
              className="ai-demo-badge"
              tabIndex={0}
              title={t.syntheticDataResultsOnlyVerifyTechnicalOperation}
            >
              {t.demoDataTestingOnly}
            </span>
          )}
        </div>
      </div>
      <div className="ai-result-filters" role="group" aria-label={t.resultFilters}>
        <label>
          {t.unit}
          <select
            aria-label={t.chartUnit}
            value={unit ?? ''}
            onChange={(e) => setUnit(e.target.value)}
          >
            {units.map((u) => (
              <option key={u} value={u}>
                {formatUnit(u)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.testWindow}
          <select
            aria-label={t.chartWindow}
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
          >
            {evaluation.protocol.horizons.map((h) => (
              <option key={h} value={h}>
                {h} {t.days}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.selectedModel2}
          <select
            aria-label={t.chartModel}
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
          >
            {metrics.map((m) => (
              <option key={m.model}>{m.model}</option>
            ))}
          </select>
        </label>
        <label>
          {t.seriesInTheSampleChart}
          <select
            aria-label={t.chartSeries}
            value={selected ?? ''}
            onChange={(e) => setPair(e.target.value)}
          >
            {!pairs.length && <option value="">{t.noSamplesYet}</option>}
            {pairs.map((p) => (
              <option key={p} value={p}>
                {(JSON.parse(p) as string[]).join(' / ')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="ai-metric-scope">
        {t.metrics} <strong>{algorithm}</strong> {t.allSeries} {displayUnit} {t.test} {horizon}{' '}
        {t.daysTheModelIsSelectedUsingValidation}
      </p>
      <div className="ai-metric-cards">
        {[
          ['WAPE', format(chosen?.wape, true), t.relativeErrorLowerIsBetterUndefinedWhen],
          ['MAE', format(chosen?.mae), dynamic.maeHelp(displayUnit)],
          ['RMSE', format(chosen?.rmse), dynamic.rmseHelp(displayUnit)],
          [t.datasetSeries, numberText(eda.pairs), t.totalSeriesInTheEntireDatasetNot],
        ].map(([label, value, note]) => (
          <div key={label} tabIndex={0} title={note}>
            <span>{label}</span>
            <strong>{value}</strong>
            {['MAE', 'RMSE'].includes(label) && <small>{displayUnit}</small>}
            <p className="ai-metric-note">{note}</p>
          </div>
        ))}
      </div>
      <div className="ai-chart-grid">
        <div className="ai-chart-cell">
          <LineChart
            unit={displayUnit}
            title={dynamic.actualForecast(displayUnit)}
            labels={points.map((p) => p.date)}
            series={[
              { name: t.actual2, values: points.map((p) => p.actual), color: '#17604f' },
              { name: t.forecast3, values: points.map((p) => p.predicted), color: '#c4742a' },
            ]}
          />
          <p className="field-hint">
            {t.selectedSeriesTestSample} {horizon} {t.daysTheKpisAboveUseAllSeries} {displayUnit}.
          </p>
        </div>
        <Chart title={t.modelComparison} note={dynamic.wapeHelp(horizon, displayUnit)}>
          <div className="ai-bar-list">
            {ranked.map((m) => (
              <div
                key={m.model}
                className={
                  m.metric?.wape != null && m.metric.wape === ranked[0]?.metric?.wape
                    ? 'ai-best-model'
                    : ''
                }
              >
                <div>
                  <span>
                    {m.model}
                    {m.metric?.wape != null && m.metric.wape === ranked[0]?.metric?.wape && (
                      <small>{t.lowestOnTheTestPeriod}</small>
                    )}
                  </span>
                  <strong>{format(m.metric?.wape, true)}</strong>
                </div>
                <div
                  className="ai-bar-track"
                  tabIndex={0}
                  title={dynamic.lowerBetter(m.model, format(m.metric?.wape, true))}
                >
                  <span style={{ width: `${(100 * (m.metric?.wape ?? 0)) / maxWape}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="field-hint">{t.sameWindowAndUnitMeansUndefinedNot}</p>
        </Chart>
      </div>
      <details className="ai-advanced ai-analytics">
        <summary>
          {t.detailedAnalysis}
          <span>{t.salesCalendarDensityAndFeatures}</span>
        </summary>
        <label className="ai-inline-filter">
          {t.chart}
          <select
            aria-label={t.detailedAnalysis}
            value={advanced}
            onChange={(e) => setAdvanced(e.target.value)}
          >
            <option value="calendar">{t.salesCalendar}</option>
            <option value="density">{t.actualForecastDensity}</option>
            <option value="errors">{t.sampleErrorDistribution}</option>
            <option value="correlation">{t.featureCorrelation}</option>
            <option value="missing">{t.missingData}</option>
            {evaluation.feature_importance && (
              <option value="importance">{t.lightgbmFeatureImportance}</option>
            )}
          </select>
        </label>
        {advanced === 'calendar' &&
          (byUnit ? (
            <Calendar daily={byUnit.daily} unit={displayUnit} />
          ) : (
            <p>{t.noDailyDataYet}</p>
          ))}
        {advanced === 'density' && <Density points={points} unit={displayUnit} />}
        {advanced === 'errors' && (
          <Chart
            title={t.sampleErrorDistribution}
            note={dynamic.errorNote(algorithm, horizon, displayUnit)}
          >
            <ErrorDistribution points={points} unit={displayUnit} />
          </Chart>
        )}
        {['correlation', 'missing'].includes(advanced) &&
          (features ? (
            advanced === 'correlation' ? (
              <Chart
                title={t.featureCorrelation}
                note={dynamic.pearsonHelp(
                  features.eligible_rows,
                  displayUnit,
                  eda.feature_diagnostics!.train_end,
                )}
              >
                <Heatmap
                  title={t.featureCorrelation}
                  rows={features.labels.map(featureName)}
                  columns={features.labels.map(featureName)}
                  values={features.correlation}
                  diverging
                />
              </Chart>
            ) : (
              <Chart title={t.missingDataOverTime} note={dynamic.missingHelp(displayUnit)}>
                <Heatmap
                  title={t.missingDataOverTime}
                  rows={features.labels.map(featureName)}
                  columns={features.missing.map((b) => b.from)}
                  values={features.labels.map((_, i) => features.missing.map((b) => b.percent[i]))}
                />
              </Chart>
            )
          ) : (
            <p className="ai-notice">{t.thisRunHasNoSavedFeatureData}</p>
          ))}
        {advanced === 'importance' && evaluation.feature_importance && (
          <Chart title={t.lightgbmFeatureImportance} note={t.numberOfLightgbmSplitsInThisRun}>
            <DataTable
              rows={Object.entries(evaluation.feature_importance)
                .sort((a, b) => b[1] - a[1])
                .map(([name, value]) => ({
                  [t.feature]: featureName(name),
                  [t.splitCount]: value,
                }))}
            />
          </Chart>
        )}
      </details>
      <details className="ai-advanced">
        <summary>{t.figuresEvaluationMethod}</summary>
        <DataTable
          rows={metrics.map((m) => ({
            [t.model]: m.model,
            [t.unit]: displayUnit,
            MAE: m.metric?.mae,
            RMSE: m.metric?.rmse,
            'WAPE (%)': m.metric?.wape == null ? null : m.metric.wape * 100,
            [t.biasPercent]: m.metric?.bias == null ? null : m.metric.bias * 100,
          }))}
        />
        <div className="ai-split">
          <div>
            {t.trainingThrough} {evaluation.protocol.validation_origin}
          </div>
          <div>
            {t.validationThrough} {evaluation.protocol.test_origin}
          </div>
          <div>
            {t.testThrough} {evaluation.protocol.test_end}
          </div>
        </div>
        <p className="field-hint">{t.noRandomSplittingTestDataIsNot}</p>
        <DataTable
          rows={[
            {
              [t.totalDatasetRows]: eda.rows,
              [t.missingSourceValues]: eda.missing_values,
              [t.duplicateRows]: eda.duplicates,
              [t.zeroSalesDays]: eda.zero_days,
            },
          ]}
        />
        {result.metadata.contains_synthetic && (
          <p className="ai-notice">{t.syntheticDemoBacktestNotEvidenceOfReal}</p>
        )}
      </details>
    </div>
  );
}
function ErrorDistribution({
  points,
  unit,
}: {
  points: { actual: number; predicted: number }[];
  unit: string;
}) {
  const { t } = usePageCopy();
  if (!points.length) return <p>{t.noMatchingSamplePointsYet}</p>;
  const values = points.map((p) => p.predicted - p.actual);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min || 1) / 10;
  const counts = Array<number>(10).fill(0);
  values.forEach((value) => counts[Math.min(9, Math.floor((value - min) / width))]++);
  const peak = Math.max(1, ...counts);
  return (
    <>
      <svg viewBox="0 0 640 220" role="img" aria-label={t.sampleErrorDistribution}>
        <text x="12" y="16">
          {t.pointCount}
        </text>
        <text x="12" y="40">
          {peak}
        </text>
        {counts.map((count, i) => (
          <rect
            data-point
            tabIndex={0}
            key={i}
            x={55 + i * 55}
            y={180 - (count / peak) * 140}
            width="48"
            height={(count / peak) * 140}
            fill="#6585b4"
          >
            <title>
              {format(min + i * width)} → {format(min + (i + 1) * width)} {unit}: {count} {t.points}
            </title>
          </rect>
        ))}
        <line x1="50" x2="610" y1="180" y2="180" stroke="#cbd5d1" />
        <text x="50" y="202">
          {format(min)}
        </text>
        <text x="610" y="202" textAnchor="end">
          {format(min + 10 * width)} {unit}
        </text>
      </svg>
      <details>
        <summary>{t.viewSourceFigures}</summary>
        <DataTable
          rows={counts.map((count, i) => ({
            [t.fromValue]: min + i * width,
            [t.toValue]: min + (i + 1) * width,
            [t.pointCount]: count,
            [t.unit]: unit,
          }))}
        />
      </details>
    </>
  );
}

function usePageCopy() {
  const t = useScreen('result_dashboard');
  const featureName = (name: string) =>
    name === 'quantity'
      ? t.salesQuantity
      : name === 'day_of_week'
        ? t.dayOfWeek
        : name === 'month'
          ? t.month
          : name.replace('rolling_mean_', t.average + ' ').replace('lag_', t.lag + ' ') +
            (' ' + t.days);
  return { t, featureName };
}
