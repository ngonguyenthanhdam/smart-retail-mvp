'use client';
import { Feedback } from '@/i18n/feedback';
import { useLocale, useScreen } from '@/i18n/provider';
import { useState, type ReactNode } from 'react';
import { apiRequest } from '@/lib/api';
import { formatMoney, formatQuantity, type NumericValue } from '@/lib/format';
import { useFormatters } from '@/i18n/formatters';
import type { SourceColumn } from '@/i18n/source-columns';
import { vi as fallback } from '@/i18n/screens/shared';
export const aiGet = <T,>(path: string) => apiRequest<T>('/ai-center' + path, undefined, 30000);
export const aiPost = <T,>(path: string, data: unknown = {}) =>
  apiRequest<T>(
    '/ai-center' + path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
    190000,
  );
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : fallback.couldNotCompleteTheRequestPleaseTry;
export const numberText = (n: unknown) =>
  typeof n === 'number' ? formatQuantity(n) : n === null || n === undefined ? '—' : String(n);
export const dateText = (s: string) =>
  new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

export function Badge({ status }: { status: string }) {
  const statusLabel = useAiStatus();
  return (
    <span className={`ai-badge ai-badge-${status.toLowerCase()}`} title={statusLabel(status)}>
      {statusLabel(status)}
    </span>
  );
}
export function useAiStatus() {
  const { t, statusNames } = usePageCopy();
  return (status: string) =>
    status === 'READY'
      ? t.ready
      : status === 'REVIEW'
        ? t.reviewRequired
        : (statusNames[status] ?? status);
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <p className="form-error" role="alert">
      {<Feedback text={error} />}
    </p>
  ) : null;
}
export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="ai-section">
      <div className="ai-section-heading">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
export function DataTable({
  rows,
  columns = {},
}: {
  rows: Record<string, unknown>[];
  columns?: Record<string, SourceColumn>;
}) {
  const { formatUnit, formatQuantityWithUnit } = useFormatters();
  const { t } = usePageCopy();
  const [page, setPage] = useState(0);
  const lastPage = Math.max(0, Math.ceil(rows.length / 8) - 1);
  const currentPage = Math.min(page, lastPage);
  if (!rows.length) return <p className="field-hint">{t.noMatchingRecordsYet}</p>;
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return (
    <>
      <div
        className="admin-table-scroll ai-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={t.aiDataTable}
      >
        <table className="admin-table ai-table">
          <thead>
            <tr>
              {keys.map((key) => (
                <th key={key} scope="col">
                  {columns[key]?.label ?? key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(currentPage * 8, (currentPage + 1) * 8).map((row, i) => (
              <tr key={i}>
                {keys.map((key) => (
                  <td key={key}>
                    {columns[key]?.kind === 'money'
                      ? formatMoney(row[key] as NumericValue)
                      : columns[key]?.kind === 'quantity'
                        ? formatQuantityWithUnit(
                            row[key] as NumericValue,
                            row[columns[key].unitKey ?? ''] as string | undefined,
                          )
                        : columns[key]?.kind === 'unit'
                          ? formatUnit(row[key] as string | undefined)
                          : typeof row[key] === 'object' && row[key] !== null
                            ? JSON.stringify(row[key])
                            : numberText(row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && (
        <div className="ai-row ai-pagination">
          <span className="field-hint">
            {t.row} {currentPage * 8 + 1}–{Math.min((currentPage + 1) * 8, rows.length)} /{' '}
            {numberText(rows.length)}
          </span>
          <button
            className="ai-link"
            type="button"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            {t.previousPage}
          </button>
          <button
            className="ai-link"
            type="button"
            disabled={currentPage === lastPage}
            onClick={() => setPage(currentPage + 1)}
          >
            {t.nextPage}
          </button>
        </div>
      )}
    </>
  );
}
export function LineChart({
  title,
  labels,
  series,
  unit,
}: {
  title: string;
  labels: string[];
  series: { name: string; values: number[]; color: string }[];
  unit?: string;
}) {
  const { t } = usePageCopy();
  if (!labels.length)
    return (
      <figure className="ai-chart">
        <figcaption>{title}</figcaption>
        <p className="field-hint">{t.noMatchingSamplePointsYet}</p>
      </figure>
    );
  const values = series.flatMap((s) => s.values).filter(Number.isFinite);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const span = max - min || 1;
  return (
    <figure className="ai-chart">
      <figcaption>{title}</figcaption>
      <ChartInteraction>
        <svg viewBox="0 0 640 200" role="img" aria-label={title}>
          {[20, 90, 160].map((y) => (
            <line key={y} x1="50" y1={y} x2="620" y2={y} stroke="#e4eae7" />
          ))}
          <text x="4" y="22">
            {numberText(max)}
          </text>
          <text x="4" y="164">
            {numberText(min)}
          </text>
          {series.map((s) => (
            <g key={s.name}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                points={s.values
                  .map(
                    (n, i) =>
                      `${50 + (i / Math.max(1, labels.length - 1)) * 570},${160 - ((n - min) / span) * 140}`,
                  )
                  .join(' ')}
              />
              {s.values.map((n, i) => (
                <circle
                  data-point
                  tabIndex={0}
                  key={i}
                  cx={50 + (i / Math.max(1, labels.length - 1)) * 570}
                  cy={160 - ((n - min) / span) * 140}
                  r="4"
                  fill={s.color}
                >
                  <title>
                    {labels[i]} · {s.name}: {numberText(n)} {unit}
                  </title>
                </circle>
              ))}
            </g>
          ))}
          <text x="50" y="190">
            {labels[0]}
          </text>
          <text x="620" y="190" textAnchor="end">
            {labels.at(-1)}
          </text>
        </svg>
      </ChartInteraction>
      <div className="ai-row">
        {series.map((s) => (
          <span key={s.name} style={{ color: s.color }}>
            ● {s.name}
          </span>
        ))}
      </div>
      <details>
        <summary>{t.viewChartFigures}</summary>
        <DataTable
          rows={labels.map((label, i) =>
            Object.fromEntries([
              [t.datePeriod, label],
              ...series.map((s) => [unit ? `${s.name} (${unit})` : s.name, s.values[i]]),
            ]),
          )}
        />
      </details>
    </figure>
  );
}
export function ChartInteraction({ children }: { children: ReactNode }) {
  const { t } = usePageCopy();
  const { locale } = useLocale();
  const [tip, setTip] = useState<{ text: string; locale: string } | null>(null);
  function inspect(target: EventTarget) {
    if (target instanceof Element)
      setTip({
        text: target.closest('[data-point]')?.querySelector('title')?.textContent ?? '',
        locale,
      });
  }
  return (
    <div
      className="ai-chart-interaction"
      onMouseOver={(e) => inspect(e.target)}
      onMouseLeave={() => setTip(null)}
      onFocus={(e) => inspect(e.target)}
      onBlur={() => setTip(null)}
    >
      <div>{children}</div>
      <div className="ai-chart-tooltip" role="status">
        {(tip?.locale === locale && tip.text) || t.hoverOverOrTabToAPoint}
      </div>
    </div>
  );
}

function usePageCopy() {
  const t = useScreen('shared');
  const statusNames: Record<string, string> = {
    PENDING: t.pending,
    VALID: t.valid,
    STAGING: t.preparing,
    PUBLISHED: t.published,
    EXPIRED: t.expired,
    INVALID_FORMAT: t.invalidFormat,
    MISSING_REQUIRED_FIELDS: t.requiredDataMissing,
    NEEDS_MAPPING: t.columnMappingRequired,
    UNSUPPORTED_DATASET: t.unsupportedDataset,
    DUPLICATE_DATA: t.duplicateData,
    ACCESS_DENIED: t.outsideScope,
    RUNNING: t.running,
    COMPLETED: t.completed,
    FAILED: t.failed,
    CANCELLED: t.cancelled,
    CANDIDATE: t.candidate,
    ACTIVE: t.active,
    ARCHIVED: t.archived,
  };
  return { t, statusNames };
}
