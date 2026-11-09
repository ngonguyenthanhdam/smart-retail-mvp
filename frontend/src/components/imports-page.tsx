'use client';
import { useFormatters } from '@/i18n/formatters';
import { Feedback } from '@/i18n/feedback';
import { useDynamic } from '@/i18n/dynamic';
import { useMessages, useScreen } from '@/i18n/provider';
import type { importCopy as c } from '@/i18n/vi';
import { catalogError } from '@/lib/catalog';
import { useEffect, useRef, useState } from 'react';
import { FileUp, CheckCircle2, Trash2 } from 'lucide-react';
import { AdminDialog } from './admin-dialog';
import { apiRequest } from '@/lib/api';
import Link from 'next/link';
import { translateMessage } from '@/lib/error-copy';
import type { Page } from '@/lib/catalog';

import { StatusValue } from './status-value';
import { formatQuantity } from '@/lib/format';
type ImportType = keyof typeof c.types;
type Definitions = {
  types: Record<ImportType, { columns: string[]; required: string[]; instructions: string }>;
};
type Job = {
  id: string;
  importType: ImportType;
  fileName: string;
  status: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  createdAt: string;
  errorReport: { row: number; error: string }[] | null;
  columns?: string[];
  validRows?: number;
  invalidRows?: number;
  previewAvailable?: boolean;
  previewToken?: string;
  sampleRows?: { row: number; values: Record<string, string>; valid: boolean }[];
};
type Pick = { key: string; file: File; type: ImportType | 'AUTO'; job?: Job; error?: string };

function Errors({ errors }: { errors: NonNullable<Job['errorReport']> }) {
  const { t, errorText } = usePageCopy();
  const [page, setPage] = useState(0);
  const count = Math.ceil(errors.length / 10);
  const current = Math.min(page, count - 1);
  return (
    <div className="import-errors">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t.csvRow}</th>
              <th>{t.issuesToFix}</th>
            </tr>
          </thead>
          <tbody>
            {errors.slice(current * 10, current * 10 + 10).map((e, i) => (
              <tr key={i}>
                <td>{e.row || '—'}</td>
                <td>{errorText(e.error)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {count > 1 && (
        <div className="import-pagination">
          <span>
            {current + 1}/{count} · {errors.length} {t.rowsWithErrors}
          </span>
          <button
            className="text-button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            {t.previous}
          </button>
          <button
            className="text-button"
            disabled={current + 1 === count}
            onClick={() => setPage(current + 1)}
          >
            {t.next}
          </button>
        </div>
      )}
    </div>
  );
}
export function ImportsPage() {
  const { displayDate } = useFormatters();
  const dynamic = useDynamic();
  const { vi, c, t, statusText, help } = usePageCopy();
  const [type, setType] = useState<ImportType | 'AUTO'>('AUTO');
  const [definitions, setDefinitions] = useState<Definitions | null>(null);
  const [history, setHistory] = useState<Page<Job> | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [progress, setProgress] = useState('');
  const locked = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    Promise.all([
      apiRequest<Definitions>('/imports/templates', { signal: abort.signal }),
      apiRequest<Page<Job>>(`/imports?page=${page}`, { signal: abort.signal }),
    ])
      .then(([defs, jobs]) => {
        if (!abort.signal.aborted) {
          setDefinitions(defs);
          setHistory(jobs);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(catalogError(e));
      });
    return () => abort.abort();
  }, [page, revision]);
  function refresh() {
    setRevision((n) => n + 1);
  }
  function receive(job: Job) {
    setPicks((items) =>
      items.map((p) => (p.job?.id === job.id ? { ...p, job, error: undefined } : p)),
    );
    setDetail(job);
  }
  async function act(fn: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(catalogError(e));
    } finally {
      locked.current = false;
      setBusy(false);
      setProgress('');
    }
  }
  function choose(files: FileList | null) {
    if (!files) return;
    setError('');
    setNotice('');
    const incoming = Array.from(files);
    if (
      picks.length + incoming.length > 20 ||
      incoming.some((f) => !/\.(csv|xlsx)$/i.test(f.name) || f.size > 2 * 1024 * 1024 || !f.size)
    ) {
      setError(t.selectUpTo20NonemptyCsvXlsx);
      return;
    }
    setPicks((previous) => [
      ...previous,
      ...incoming.map((file) => ({ key: crypto.randomUUID(), file, type })),
    ]);
  }
  async function preview(pick: Pick) {
    const form = new FormData();
    form.set('importType', pick.type);
    form.set('file', pick.file);
    const job = await apiRequest<Job>('/imports/preview', { method: 'POST', body: form }, 45000);
    setPicks((items) =>
      items.map((p) => (p.key === pick.key ? { ...p, job, error: undefined } : p)),
    );
    return job;
  }
  async function validatePicks() {
    await act(async () => {
      const targets = picks.filter((p) => !p.job);
      let succeeded = 0;
      for (const [i, pick] of targets.entries()) {
        setProgress(dynamic.validating(i + 1, targets.length, pick.file.name));
        try {
          const job = await preview(pick);
          succeeded++;
          if (targets.length === 1) {
            setDetail(job);
            setUncertain(false);
          }
        } catch (e) {
          setPicks((items) =>
            items.map((p) => (p.key === pick.key ? { ...p, error: catalogError(e) } : p)),
          );
        }
      }
      setNotice(dynamic.validatedFiles(succeeded, targets.length));
      refresh();
    });
  }
  async function open(id: string) {
    await act(async () => {
      setUncertain(false);
      let job = await apiRequest<Job>(`/imports/${id}`);
      if (job.status === 'PENDING' && job.previewAvailable)
        job = await apiRequest<Job>(`/imports/${id}/revalidate`, { method: 'POST' }, 45000);
      receive(job);
    });
  }
  async function transition(action: 'confirm' | 'cancel' | 'revalidate') {
    if (!detail) return;
    await act(async () => {
      try {
        const job = await apiRequest<Job>(
          `/imports/${detail.id}/${action}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action === 'confirm' ? { previewToken: detail.previewToken } : {}),
          },
          75000,
        );
        receive(job);
        setUncertain(false);
        refresh();
        setNotice(
          action === 'confirm'
            ? dynamic.importResult(job.successRows, job.fileName, job.failedRows)
            : action === 'cancel'
              ? dynamic.cancelledFile(job.fileName)
              : t.revalidatedAgainstTheCurrentCatalog,
        );
      } catch (e) {
        setUncertain(true);
        refresh();
        throw e;
      }
    });
  }
  async function dismiss(job: Job) {
    await act(async () => {
      await apiRequest(`/imports/${job.id}`, { method: 'DELETE' });
      setDetail(null);
      setPicks((items) => items.filter((p) => p.job?.id !== job.id));
      setNotice(t.theImportHasBeenRemovedFromThe);
      refresh();
    });
  }
  function download() {
    if (!definitions || type === 'AUTO') return;
    const url = URL.createObjectURL(
      new Blob(['\ufeff' + definitions.types[type].columns.join(',') + '\r\n'], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type.toLowerCase()}-template.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const pages = Math.max(1, Math.ceil((history?.total ?? 0) / 20));
  const blocked =
    detail?.status === 'PENDING'
      ? !detail.previewAvailable
        ? c.expired
        : !detail.validRows
          ? t.cannotImportNoValidRowsReviewThe
          : uncertain
            ? c.uncertain
            : ''
      : '';
  return (
    <div className="page-content import-page">
      <div className="page-heading">
        <div>
          <h1>{c.title}</h1>
          <p className="page-description">{t.selectFilesValidateReviewResultsImportData}</p>
        </div>
      </div>
      {notice && (
        <p className="form-success import-feedback" role="status">
          <CheckCircle2 size={18} />
          {<Feedback text={notice} />}
        </p>
      )}
      {!detail && error && (
        <p className="form-error import-feedback" role="alert">
          {<Feedback text={error} />}
        </p>
      )}
      <section className="admin-card import-upload">
        <h2>{t.label1SelectDataToImport}</h2>
        <p>
          {t.businessCsvFilesIn} <strong>datasets/chatbot-business</strong>{' '}
          {t.areUsedOnThisPageCsvFiles} <strong>datasets/ai-center</strong> {t.areUsedIn}{' '}
          <Link className="text-button" href="/ai-center">
            AI Center
          </Link>
          .
        </p>
        <div className="admin-filters">
          <div className="form-field">
            <label htmlFor="import-type">{t.detectDataType}</label>
            <select
              id="import-type"
              value={type}
              disabled={busy}
              onChange={(e) => setType(e.target.value as ImportType | 'AUTO')}
            >
              <option value="AUTO">{t.automaticallyDetectFromColumnsRecommended}</option>
              {Object.entries(c.types).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="import-file">{t.selectOneOrMoreFiles}</label>
            <input
              id="import-file"
              type="file"
              accept=".csv,.xlsx"
              multiple
              disabled={busy}
              onChange={(e) => {
                choose(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        <p>{t.upTo20FilesPerSelection2}</p>
        <details className="import-help">
          <summary>{t.csvTemplatesAndPrerequisites}</summary>
          <p>
            {t.createStoresIn}{' '}
            <Link className="text-button" href="/stores">
              {t.store}
            </Link>
            {t.categoriesIn}{' '}
            <Link className="text-button" href="/products/categories">
              {t.categories}
            </Link>{' '}
            {t.andUnitsIn}{' '}
            <Link className="text-button" href="/products/units">
              {t.unit}
            </Link>
            {t.thenImportProductsBeforeSalesInventoryHistory}
          </p>
          {Object.entries(help).map(([key, text]) => (
            <p key={key}>
              <strong>{c.types[key as ImportType]}:</strong> {text}
            </p>
          ))}
          {type !== 'AUTO' && definitions ? (
            <>
              <p>
                {t.requiredColumns} {definitions.types[type].required.join(', ')}
              </p>
              <button type="button" className="secondary-button" onClick={download}>
                {t.downloadCsvTemplate}
              </button>
            </>
          ) : (
            <p>{t.selectASpecificTypeAboveToDownload}</p>
          )}
        </details>
        {!!picks.length && (
          <div className="import-picked">
            <h3>
              {t.label2SelectedFiles}
              {picks.length})
            </h3>
            {picks.map((p) => (
              <article className="import-pick" key={p.key}>
                <div>
                  <strong>{p.file.name}</strong>
                  <p>
                    {(p.file.size / 1024).toFixed(1)} {t.kb}{' '}
                    {p.job ? `${c.types[p.job.importType]} · ${statusText(p.job)}` : t.notValidated}
                    {p.job?.status === 'PENDING'
                      ? ` · ${dynamic.validationCounts(p.job.validRows ?? 0, p.job.invalidRows ?? 0)}`
                      : ''}
                  </p>
                  {p.error && (
                    <p className="form-error">
                      <Feedback text={p.error} />
                    </p>
                  )}
                </div>
                <div className="import-pick-actions">
                  {!p.job && (
                    <>
                      <select
                        aria-label={dynamic.fileType(p.file.name)}
                        disabled={busy}
                        value={p.type}
                        onChange={(e) =>
                          setPicks((items) =>
                            items.map((item) =>
                              item.key === p.key
                                ? {
                                    ...item,
                                    type: e.target.value as Pick['type'],
                                    error: undefined,
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="AUTO">{t.autoDetect}</option>
                        {Object.entries(c.types).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          setPicks((items) => items.filter((item) => item.key !== p.key))
                        }
                      >
                        {t.removeFile}
                      </button>
                    </>
                  )}
                  {p.job && (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void open(p.job!.id)}
                    >
                      {t.viewResultsImport}
                    </button>
                  )}
                </div>
              </article>
            ))}
            <div className="import-toolbar">
              <button
                className="primary-button"
                disabled={busy || !definitions || !picks.some((p) => !p.job)}
                onClick={() => void validatePicks()}
              >
                <FileUp size={17} />
                {busy ? t.processing : t.validateAndPreview}
              </button>
              <span role="status">
                {progress ? <Feedback text={progress} /> : t.eachFileHasItsOwnResultValid}
              </span>
            </div>
          </div>
        )}
      </section>
      <section className="admin-card">
        <div className="report-section-heading">
          <h2>{t.importHistoryAndResults}</h2>
          <button className="secondary-button" disabled={busy} onClick={refresh}>
            {t.refresh}
          </button>
        </div>
        {!history && !error && (
          <p role="status" className="admin-loading">
            {c.loading}
          </p>
        )}
        {history?.total === 0 && <p className="admin-loading">{c.empty}</p>}
        {!!history?.items.length && (
          <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={c.history}>
            <table className="admin-table">
              <thead>
                <tr>
                  {[c.fileName, c.type, c.status, t.results, c.created, vi.admin.actions].map(
                    (s) => (
                      <th key={s}>{s}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {history.items.map((job) => (
                  <tr key={job.id}>
                    <th scope="row">{job.fileName}</th>
                    <td>{c.types[job.importType]}</td>
                    <td>{statusText(job)}</td>
                    <td>
                      {job.status === 'PENDING'
                        ? dynamic.pendingRows(job.totalRows)
                        : dynamic.importedRows(job.successRows, job.failedRows)}
                    </td>
                    <td>{displayDate(job.createdAt)}</td>
                    <td>
                      <div className="import-pick-actions">
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => void open(job.id)}
                        >
                          {t.viewResults}
                        </button>
                        {job.status === 'FAILED' && !job.successRows && (
                          <button
                            className="text-button import-delete"
                            disabled={busy}
                            onClick={() => void dismiss(job)}
                          >
                            <Trash2 size={14} />
                            {t.removeFromList}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {history && (
          <div className="admin-pagination">
            <p>{vi.admin.pagination(page, pages, history.total)}</p>
            <div>
              <button
                className="secondary-button"
                disabled={page === 1 || busy}
                onClick={() => setPage(page - 1)}
              >
                {vi.admin.previous}
              </button>
              <button
                className="secondary-button"
                disabled={page >= pages || busy}
                onClick={() => setPage(page + 1)}
              >
                {vi.admin.next}
              </button>
            </div>
          </div>
        )}
      </section>
      {detail && (
        <AdminDialog
          titleId="import-review-title"
          busy={busy}
          onClose={() => {
            setDetail(null);
            setError('');
          }}
        >
          <div className="operation-dialog">
            <h2 id="import-review-title">{c.review}</h2>
            <p>
              <strong>{detail.fileName}</strong> · {c.types[detail.importType]} ·{' '}
              {statusText(detail)}
            </p>
            {error && (
              <p className="form-error" role="alert">
                {<Feedback text={error} />}
              </p>
            )}
            <div className="import-counts">
              <p>
                {t.totalRows} <strong>{formatQuantity(detail.totalRows)}</strong>
              </p>
              {detail.status === 'PENDING' ? (
                <>
                  <StatusValue tone={detail.validRows ? 'success' : 'neutral'} label={t.validRows}>
                    {detail.validRows == null ? '—' : formatQuantity(detail.validRows)}
                  </StatusValue>
                  <StatusValue
                    tone={detail.invalidRows ? 'danger' : 'neutral'}
                    label={t.invalidRows}
                  >
                    {detail.invalidRows == null ? '—' : formatQuantity(detail.invalidRows)}
                  </StatusValue>
                </>
              ) : (
                <>
                  <StatusValue
                    tone={detail.successRows ? 'success' : 'neutral'}
                    label={t.importedRows}
                  >
                    {formatQuantity(detail.successRows)}
                  </StatusValue>
                  <StatusValue
                    tone={detail.failedRows ? 'danger' : 'neutral'}
                    label={t.rejectedRows}
                  >
                    {formatQuantity(detail.failedRows)}
                  </StatusValue>
                </>
              )}
            </div>
            {blocked && (
              <p className="import-blocked" role="status">
                {blocked}
              </p>
            )}
            {detail.status === 'PENDING' && (
              <p>
                {help[detail.importType]} {c.confirmHint}
              </p>
            )}
            {detail.status === 'PENDING' && !detail.validRows && (
              <p className="import-reference-links">
                {t.addMissingRecordsIn}{' '}
                <Link href="/stores" target="_blank" rel="noreferrer">
                  {t.store}
                </Link>{' '}
                ·{' '}
                <Link href="/products/categories" target="_blank" rel="noreferrer">
                  {t.categories}
                </Link>{' '}
                ·{' '}
                <Link href="/products/units" target="_blank" rel="noreferrer">
                  {t.unit}
                </Link>{' '}
                ·{' '}
                <Link href="/products" target="_blank" rel="noreferrer">
                  {t.products}
                </Link>
                {t.afterSavingReturnAndRevalidateThisFile}
              </p>
            )}
            {!!detail.errorReport?.length && (
              <Errors key={detail.id + detail.previewToken} errors={detail.errorReport} />
            )}
            {detail.sampleRows && (
              <details className="import-help">
                <summary>{t.dataPreviewUpTo20Rows}</summary>
                <div className="admin-table-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t.row}</th>
                        {detail.columns?.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.sampleRows.map((row) => (
                        <tr key={row.row} className={row.valid ? '' : 'import-invalid'}>
                          <th scope="row">{row.row}</th>
                          {detail.columns?.map((column) => (
                            <td key={column}>{row.values[column] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            <div className="admin-form-actions import-review-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setDetail(null);
                  setError('');
                }}
              >
                {t.close}
              </button>
              {detail.status === 'PENDING' && (
                <>
                  <button
                    className="text-button"
                    disabled={busy || uncertain}
                    onClick={() => void transition('cancel')}
                  >
                    {t.cancelImport}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy || !detail.previewAvailable}
                    onClick={() => void transition('revalidate')}
                  >
                    {t.revalidate}
                  </button>
                  <button
                    className="primary-button"
                    disabled={busy || uncertain || !detail.previewAvailable || !detail.validRows}
                    onClick={() => void transition('confirm')}
                  >
                    {busy ? t.processing : t.importValidRows}
                  </button>
                </>
              )}
              {detail.status === 'FAILED' && !detail.successRows && (
                <button
                  className="text-button import-delete"
                  disabled={busy}
                  onClick={() => void dismiss(detail)}
                >
                  {t.removeFromList}
                </button>
              )}
              {uncertain && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void open(detail.id)}
                >
                  {t.refreshResults}
                </button>
              )}
            </div>
          </div>
        </AdminDialog>
      )}
    </div>
  );
}

function usePageCopy() {
  const { vi, importCopy: c } = useMessages();
  const t = useScreen('imports_page');
  const statusText = (job: Job) =>
    job.status === 'FAILED' &&
    job.errorReport?.some((e) => e.error === 'Cancelled before importing.')
      ? t.cancelled
      : ({
          PENDING: t.pendingImport,
          PROCESSING: t.importing,
          COMPLETED: t.imported,
          PARTIAL: t.partiallyImported,
          FAILED: t.failed,
        }[job.status] ?? job.status);
  const errorText = (message: string) => translateMessage(message);
  const help: Record<ImportType, string> = {
    PRODUCT: t.categoriesAndUnitsMustExistFirstOnly,
    SALE: t.storesAndProductsMustExistFirstCost,
    INVENTORY: t.activeStoresAndProductsMustExistOnly,
    PURCHASE: t.locationsAndProductsMustExistFirstOnly,
    EXPENSE: t.theLocationCodeMustExistLeaveBlank,
  };
  return { t, errorText, vi, c, statusText, help };
}
