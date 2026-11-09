'use client';
import { useFormatters } from '@/i18n/formatters';
import { Feedback, type FeedbackText } from '@/i18n/feedback';
import { useMessages, useScreen } from '@/i18n/provider';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  CircleHelp,
  RefreshCw,
  PackageCheck,
  Store,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from './auth-provider';
import { ProductImage } from './product-image';
import { DemandChart } from './demand-chart';
import { ForecastDataPanel } from './forecast-data-panel';
import { apiRequest } from '@/lib/api';
import { catalogError, allOptions } from '@/lib/catalog';
import type { Location } from '@/lib/locations';
import type { ForecastDetail, ForecastRun, ForecastReadiness } from '@/lib/forecasts';
import {
  formatForecastMonthlyQuantity,
  formatForecastDailyAverage,
  formatForecastMoney,
  formatForecastRevenueTotal,
} from '@/lib/forecast-format';

export function ForecastsPage() {
  const { formatMonth, formatTimestamp, unitLabel } = useFormatters();
  const { pcopy, c, t, errorText, algorithmLabel } = usePageCopy();
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const [stores, setStores] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [horizon, setHorizon] = useState(3);
  const [runs, setRuns] = useState<ForecastRun[] | null>(null);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<ForecastDetail | null>(null);
  const [readiness, setReadiness] = useState<ForecastReadiness | null>(null);
  const [model, setModel] = useState<{
    available: boolean;
    algorithm?: string;
    model_version?: string;
  } | null>(null);
  const [month, setMonth] = useState('');
  const [chartPair, setChartPair] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FeedbackText>('');
  const [retry, setRetry] = useState(0);
  const scope = admin && locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
  useEffect(() => {
    if (!admin) return;
    const abort = new AbortController();
    allOptions<Location>('/locations', abort.signal)
      .then((values) => {
        if (!abort.signal.aborted)
          setStores(values.filter((l) => l.locationType === 'STORE' && l.isActive));
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(catalogError(e));
      });
    return () => abort.abort();
  }, [admin]);
  useEffect(() => {
    const abort = new AbortController();
    apiRequest<{ items: ForecastRun[] }>(`/forecasts/runs${scope}`, { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted) {
          setRuns(value.items);
          setSelected((previous) =>
            value.items.some((r) => r.id === previous) ? previous : (value.items[0]?.id ?? ''),
          );
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(catalogError(e));
      });
    apiRequest<ForecastReadiness>(`/forecasts/data${scope}`, { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted) setReadiness(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(catalogError(e));
      });
    apiRequest<{ available: boolean; algorithm?: string; model_version?: string }>(
      '/forecasts/data/model',
      { signal: abort.signal },
    )
      .then((value) => {
        if (!abort.signal.aborted) setModel(value);
      })
      .catch(() => {
        if (!abort.signal.aborted) setModel({ available: false });
      });
    return () => abort.abort();
  }, [scope, retry]);
  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    apiRequest<ForecastDetail>(`/forecasts/runs/${selected}${scope}`, { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted) setDetail(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(catalogError(e));
      });
    return () => abort.abort();
  }, [selected, scope, retry]);
  function refresh() {
    setError('');
    setDetail(null);
    setRuns(null);
    setReadiness(null);
    setRetry((value) => value + 1);
  }
  async function runForecast() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<ForecastDetail>(
        '/forecasts/runs',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ horizonMonths: horizon, ...(locationId ? { locationId } : {}) }),
        },
        60000,
      );
      setSelected(result.id);
      setDetail(result);
      setMonth('');
      setChartPair('');
      setRetry((value) => value + 1);
    } catch (e) {
      setError([catalogError(e), c.uncertain]);
    } finally {
      setBusy(false);
    }
  }
  const legacy = detail?.periodKind === 'LEGACY_ROLLING_DAYS';
  const months = [
    ...new Set(!legacy ? (detail?.forecasts.map((p) => p.periodStart.slice(0, 10)) ?? []) : []),
  ].sort();
  const activeMonth = months.includes(month) ? month : months[0];
  const predictions =
    detail?.forecasts.filter((p) => p.periodStart.slice(0, 10) === activeMonth) ?? [];
  const daily = detail?.dailySeries ?? [];
  const chart = daily.find((s) => `${s.locationId}/${s.productId}` === chartPair) ?? daily[0];
  const chartProduct =
    chart &&
    detail?.forecasts.find(
      (p) => p.locationId === chart.locationId && p.productId === chart.productId,
    );
  const source =
    detail?.dataSource === 'SYNTHETIC'
      ? t.syntheticData
      : detail?.dataSource === 'MIXED'
        ? t.storeHistoryAndSyntheticData
        : t.storeHistory;
  return (
    <div className="page-content forecast-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.planForTheComingMonths}</p>
          <h1>{c.title}</h1>
          <p className="page-description">{t.howMuchMightEachProductSellUse}</p>
        </div>
        <button className="secondary-button" disabled={busy} onClick={refresh}>
          <RefreshCw size={16} />
          {c.refresh}
        </button>
      </div>
      <div className="forecast-steps">
        <div>
          <span>
            <CalendarDays size={19} />
          </span>
          <strong>{t.label1ChooseAPeriod}</strong>
          <small>{t.theNextOneOrThreeMonths}</small>
        </div>
        <ArrowRight size={18} />
        <div>
          <span>
            <ChartNoAxesCombined size={19} />
          </span>
          <strong>{t.label2ReviewExpectedSales}</strong>
          <small>{t.forEachProductAndMonth}</small>
        </div>
        <ArrowRight size={18} />
        <div>
          <span>
            <PackageCheck size={19} />
          </span>
          <strong>{t.label3DecideWhatToPurchase}</strong>
          <small>{t.compareAgainstActualInventory}</small>
        </div>
      </div>
      <section className="admin-card forecast-controls">
        <div className="admin-filters">
          {admin ? (
            <>
              <div className="form-field">
                <label htmlFor="forecast-store">{c.store}</label>
                <select
                  id="forecast-store"
                  disabled={busy}
                  value={locationId}
                  onChange={(e) => {
                    setLocationId(e.target.value);
                    setSelected('');
                    setDetail(null);
                    setRuns(null);
                    setReadiness(null);
                    setError('');
                    setMonth('');
                    setChartPair('');
                  }}
                >
                  <option value="">{c.allStores}</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="forecast-horizon">{c.horizon}</label>
                <select
                  id="forecast-horizon"
                  disabled={busy}
                  value={horizon}
                  onChange={(e) => setHorizon(Number(e.target.value))}
                >
                  <option value={1}>{c.month}</option>
                  <option value={3}>{c.quarter}</option>
                </select>
              </div>
              <button
                className="primary-button"
                disabled={busy || !readiness?.eligibleCount || !model?.available}
                onClick={() => void runForecast()}
              >
                <TrendingUp size={18} />
                {busy ? c.running : c.run}
              </button>
            </>
          ) : (
            <p>
              <Store size={17} />
              {user?.location?.name}
            </p>
          )}
        </div>
        <p className="forecast-hint">
          {readiness ? (
            <>
              <strong>{readiness.eligibleCount}</strong>{' '}
              {t.productsWithSufficientHistoryDataThrough} <strong>{readiness.origin}</strong>.{' '}
            </>
          ) : (
            t.checkingSalesHistory + ' '
          )}
          {c.horizonHint}
          {model && !model.available && ' ' + t.theForecastServiceIsNotReady}
        </p>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {<Feedback text={error} />}
        </p>
      )}
      {busy && (
        <p className="admin-loading" role="status">
          {c.runningHint}
        </p>
      )}
      {runs && (
        <div className="forecast-run-picker">
          <label htmlFor="forecast-run">{t.currentResults}</label>
          <select
            id="forecast-run"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setDetail(null);
              setMonth('');
              setChartPair('');
            }}
            disabled={busy || !runs.length}
          >
            <option value="">{runs.length ? t.selectAnUpdate : t.noUpdatesYet}</option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {formatTimestamp(run.startedAt)} · {run.horizonMonths} {t.months}{' '}
                {c.statuses[run.status]}
              </option>
            ))}
          </select>
        </div>
      )}
      {legacy && <p className="admin-card decision-hint">{t.theseResultsWereSavedAs30Or}</p>}
      {!runs && !error && (
        <p className="admin-loading" role="status">
          {c.loading}
        </p>
      )}
      {runs && !runs.length && (
        <div className="retail-empty admin-card">
          <ChartNoAxesCombined size={40} />
          <h2>{t.understandYourStoreSDemand}</h2>
          <p>{c.empty}</p>
        </div>
      )}
      {detail && (
        <>
          {detail.errorCode && (
            <p className="form-error" role="alert">
              {errorText(detail.errorCode)}
            </p>
          )}
          {!!months.length && (
            <>
              <div className="forecast-months" aria-label={t.selectAForecastMonth}>
                {months.map((value) => {
                  const rows = detail.forecasts.filter((p) => p.periodStart.startsWith(value));
                  return (
                    <button
                      key={value}
                      aria-pressed={activeMonth === value}
                      onClick={() => setMonth(value)}
                    >
                      <CalendarDays size={20} />
                      <span>
                        <strong>{formatMonth(value)}</strong>
                        <small>
                          {pcopy.approximate}{' '}
                          {formatForecastRevenueTotal(rows.map((p) => p.predictedRevenue))}{' '}
                          {t.expected}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <section className="admin-card">
                <div className="report-section-heading">
                  <div>
                    <p className="eyebrow">{activeMonth && formatMonth(activeMonth)}</p>
                    <h2>{t.expectedSalesQuantityByProduct}</h2>
                    <p className="page-description">
                      {source} · {predictions.length} {t.productsStores}
                    </p>
                  </div>
                  <Link href="/replenishment" className="primary-button">
                    {t.viewPurchaseRecommendations} <ArrowRight size={17} />
                  </Link>
                </div>
                <div
                  className="admin-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label={t.forecastByProduct}
                >
                  <table className="admin-table forecast-results-table">
                    <thead>
                      <tr>
                        <th>{t.products}</th>
                        <th>{t.store}</th>
                        <th>{t.expectedSalesQuantity}</th>
                        <th>{t.referencePrice}</th>
                        <th>{t.expectedRevenue}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {predictions.map((p) => (
                        <tr key={p.id}>
                          <th scope="row">
                            <div className="table-product">
                              <ProductImage name={p.product.name} imageKey={p.product.imageKey} />
                              <span>
                                {p.product.name}
                                <small>{p.product.sku}</small>
                              </span>
                            </div>
                          </th>
                          <td>{p.location.name}</td>
                          <td className="forecast-estimate">
                            <span>
                              {pcopy.approximate}{' '}
                              <strong>
                                {formatForecastMonthlyQuantity(p.predictedQuantity)}{' '}
                                {unitLabel(p.product.baseUnit)}
                              </strong>
                              /{pcopy.month}
                            </span>
                            <small>
                              {pcopy.daily}{' '}
                              {formatForecastDailyAverage(
                                p.predictedQuantity,
                                p.periodStart,
                                p.periodEnd,
                              )}{' '}
                              {unitLabel(p.product.baseUnit)}/{pcopy.day}
                            </small>
                          </td>
                          <td>{formatForecastMoney(p.estimatedUnitPrice)}</td>
                          <td>
                            {pcopy.approximate} {formatForecastMoney(p.predictedRevenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="forecast-hint page-description">
                  {c.revenueHint} {pcopy.forecastRounding}
                </p>
              </section>
              {chart && chartProduct && (
                <section className="admin-card">
                  <div className="report-section-heading">
                    <div>
                      <h2>{t.fromHistoryToForecast}</h2>
                      <p className="page-description">{t.theSolidLineShowsSalesHistoryThe}</p>
                    </div>
                    <label className="chart-product-picker">
                      <span className="sr-only">{t.productOnTheChart}</span>
                      <select
                        value={`${chart.locationId}/${chart.productId}`}
                        onChange={(e) => setChartPair(e.target.value)}
                      >
                        {daily.map((s) => {
                          const p = detail.forecasts.find(
                            (p) => p.locationId === s.locationId && p.productId === s.productId,
                          );
                          return (
                            <option
                              key={`${s.locationId}/${s.productId}`}
                              value={`${s.locationId}/${s.productId}`}
                            >
                              {p?.product.name} · {p?.location.name}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  </div>
                  <DemandChart
                    series={chart}
                    name={chartProduct.product.name}
                    unit={chartProduct.product.baseUnit}
                  />
                </section>
              )}
            </>
          )}
          {!!detail.skipped.length && (
            <details className="admin-card skipped-panel">
              <summary>
                {detail.skipped.length} {t.productsWithoutAForecast}
              </summary>
              <ul>
                {detail.skipped.map((pair) => (
                  <li key={`${pair.locationId}/${pair.productId}`}>
                    <strong>
                      {pair.product} · {pair.store}
                    </strong>
                    <p>{errorText(pair.reason)}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <aside className="model-explanation">
        <CircleHelp size={21} />
        <div>
          <strong>{t.understandResultsBeforeDeciding}</strong>
          <p>
            {t.currentMethod} {algorithmLabel(detail?.algorithm ?? model?.algorithm)}
            {t.theMethodWasSelectedByComparingModels}
          </p>
          <details>
            <summary>{t.administratorInformation}</summary>
            <p>
              {t.version} {detail?.modelVersion ?? model?.model_version ?? t.notReady}
              {t.updateOnlyCalculatesForecastsWithTheSaved}
            </p>
            {detail?.periodKind === 'LEGACY_ROLLING_DAYS' && (
              <p>{t.olderSavedResultsCombineMultipleDaysCreate}</p>
            )}
          </details>
        </div>
      </aside>
      <ForecastDataPanel
        key={scope}
        data={readiness}
        admin={admin}
        locationId={locationId}
        onSaved={() => setRetry((value) => value + 1)}
      />
    </div>
  );
}

function usePageCopy() {
  const { planningCopy: pcopy, forecastCopy: c } = useMessages();
  const t = useScreen('forecasts_page');
  const errorText = (code: string) =>
    c.errors[code as keyof typeof c.errors] ?? c.errors.PREDICTION_FAILED;
  const algorithmLabel = (algorithm?: string) =>
    algorithm === 'RollingMean28'
      ? t.label28DayAverage
      : algorithm === 'SeasonalNaive'
        ? t.weeklySeasonalBaseline
        : algorithm === 'LightGBM'
          ? 'LightGBM'
          : t.notDetermined;
  return { pcopy, c, t, errorText, algorithmLabel };
}
