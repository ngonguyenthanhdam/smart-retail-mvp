'use client';
import { Feedback } from '@/i18n/feedback';
import { useDynamic } from '@/i18n/dynamic';
import { useScreen } from '@/i18n/provider';
import { catalogError } from '@/lib/catalog';
import { useState, type FormEvent } from 'react';
import { CheckCircle2, Download, Database, Upload } from 'lucide-react';
import Link from 'next/link';
import { apiRequest, downloadCsv } from '@/lib/api';
import type { ForecastReadiness } from '@/lib/forecasts';
import { localDate } from '@/lib/operations';

export function ForecastDataPanel({
  data,
  admin,
  locationId,
  onSaved,
}: {
  data: ForecastReadiness | null;
  admin: boolean;
  locationId: string;
  onSaved: () => void;
}) {
  const dynamic = useDynamic();
  const { t } = usePageCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [includeSynthetic, setIncludeSynthetic] = useState(false);
  const pairs = data?.pairs.filter((pair) => pair.locationId === locationId) ?? [];
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selected.length || !locationId) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest('/forecasts/data/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          productIds: selected,
          periodStart: form.get('periodStart'),
          periodEnd: form.get('periodEnd'),
          note: form.get('note'),
        }),
      });
      setSuccess(t.historyCoverageHasBeenConfirmed);
      setSelected([]);
      onSaved();
    } catch (e) {
      setError(catalogError(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    setBusy(true);
    setError('');
    const params = new URLSearchParams();
    if (locationId) params.set('locationId', locationId);
    if (includeSynthetic) params.set('includeSynthetic', 'true');
    try {
      await downloadCsv(
        `/forecasts/data/export?${params}`,
        `lich-su-ban-hang-${data?.origin ?? localDate()}.csv`,
      );
    } catch (e) {
      setError(catalogError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="admin-card forecast-data-panel">
      <summary>
        <span>
          <Database size={18} /> {t.forecastData}
        </span>
        <span>
          {data ? dynamic.eligibleHistory(data.eligibleCount, data.pairs.length) : t.checking}
        </span>
      </summary>
      <div className="data-panel-content">
        <p>{t.atLeast30ConsecutiveDaysOfConfirmed}</p>
        {!!data?.pairs.length && (
          <div className="coverage-list">
            {data.pairs.map((pair) => {
              const needsHistoryReview = data.skipped.some(
                (skipped) =>
                  skipped.locationId === pair.locationId && skipped.productId === pair.productId,
              );
              return (
                <div key={`${pair.locationId}/${pair.productId}`}>
                  <span>
                    <strong>{pair.product}</strong>
                    <small>{pair.store}</small>
                  </span>
                  <span
                    className={`record-status ${needsHistoryReview ? 'is-inactive' : 'is-active'}`}
                  >
                    {needsHistoryReview ? t.historyReviewRequired : t.sufficientHistory}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {admin && (
          <>
            <Link href="/imports" className="secondary-button">
              <Upload size={16} /> {t.importSalesHistory}
            </Link>
            <details className="coverage-editor">
              <summary>{t.confirmCompleteImportedHistory}</summary>
              {!locationId ? (
                <p>{t.selectAStoreAboveToConfirmIts}</p>
              ) : (
                <form onSubmit={confirm}>
                  <p>{t.confirmOnlyAfterReconcilingAllTransactionsAnd}</p>
                  <div className="coverage-products">
                    {pairs.map((pair) => (
                      <label key={pair.productId}>
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={selected.includes(pair.productId)}
                          onChange={(e) =>
                            setSelected((previous) =>
                              e.target.checked
                                ? [...previous, pair.productId]
                                : previous.filter((id) => id !== pair.productId),
                            )
                          }
                        />
                        {pair.product} <small>({pair.unit})</small>
                      </label>
                    ))}
                  </div>
                  <div className="admin-form-grid">
                    <div className="form-field">
                      <label htmlFor="coverage-start">{t.fromDate}</label>
                      <input
                        id="coverage-start"
                        name="periodStart"
                        type="date"
                        max={localDate()}
                        required
                        disabled={busy}
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="coverage-end">{t.toDateBeforeToday}</label>
                      <input
                        id="coverage-end"
                        name="periodEnd"
                        type="date"
                        max={localDate()}
                        required
                        disabled={busy}
                      />
                    </div>
                    <div className="form-field admin-span-full">
                      <label htmlFor="coverage-note">{t.evidenceForConfirmation}</label>
                      <textarea
                        id="coverage-note"
                        name="note"
                        required
                        maxLength={500}
                        placeholder={t.forExampleReconciledTheSalesLedgerIncluding}
                        disabled={busy}
                      />
                    </div>
                  </div>
                  <label className="inventory-checkbox">
                    <input type="checkbox" required disabled={busy} />
                    {t.iConfirmThatHistoryForTheSelected}
                  </label>
                  <button className="primary-button" disabled={busy || !selected.length}>
                    <CheckCircle2 size={17} />
                    {busy ? t.saving : t.saveConfirmation}
                  </button>
                </form>
              )}
            </details>
            <div className="training-export">
              <div>
                <strong>{t.exportDataToTrainANewVersion}</strong>
                <p>{t.syntheticDataIsExcludedFromTrainingBy}</p>
                <label className="inventory-checkbox">
                  <input
                    type="checkbox"
                    checked={includeSynthetic}
                    onChange={(e) => setIncludeSynthetic(e.target.checked)}
                    disabled={busy}
                  />
                  {t.includeSyntheticDataToTestTheWorkflow}
                </label>
              </div>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void exportData()}
              >
                <Download size={16} /> {t.downloadCsv}
              </button>
            </div>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {<Feedback text={error} />}
          </p>
        )}
        {success && (
          <p className="form-success" role="status">
            {<Feedback text={success} />}
          </p>
        )}
      </div>
    </details>
  );
}

function usePageCopy() {
  const t = useScreen('forecast_data_panel');

  return { t };
}
