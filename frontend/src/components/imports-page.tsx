"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { AdminDialog } from './admin-dialog';
import { catalogError } from './product-form';
import { apiRequest } from '@/lib/api';
import type { Page } from '@/lib/catalog';
import { displayDate } from '@/lib/operations';
import { vi, importCopy as c } from '@/i18n/vi';

type ImportType = keyof typeof c.types;
type Definitions = { types: Record<ImportType, { columns: string[]; required: string[]; instructions: string }> };
type Job = { id: string; importType: ImportType; fileName: string; status: string; totalRows: number; successRows: number; failedRows: number;
  createdAt: string; creator: { fullName: string } | null; errorReport: { row: number; error: string }[] | null;
  columns?: string[]; validRows?: number; invalidRows?: number; previewAvailable?: boolean; previewToken?: string;
  sampleRows?: { row: number; values: Record<string, string>; valid: boolean }[] };

export function ImportsPage() {
  const [type, setType] = useState<ImportType>('PRODUCT'); const [definitions, setDefinitions] = useState<Definitions | null>(null);
  const [history, setHistory] = useState<Page<Job> | null>(null); const [page, setPage] = useState(1); const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<Job | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    Promise.all([apiRequest<Definitions>('/imports/templates', { signal: abort.signal }), apiRequest<Page<Job>>(`/imports?page=${page}`, { signal: abort.signal })])
      .then(([defs, jobs]) => { if (!abort.signal.aborted) { setDefinitions(defs); setHistory(jobs); } })
      .catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [page, revision]);
  function refresh() { setError(''); setHistory(null); setRevision(revision + 1); }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); setUncertain(false);
    try { setDetail(await apiRequest<Job>('/imports/preview', { method: 'POST', body: form }, 45000)); setRevision(revision + 1); }
    catch (e) { setError(catalogError(e)); } finally { setBusy(false); }
  }
  async function open(id: string) {
    setBusy(true); setError(''); setUncertain(false);
    try { setDetail(await apiRequest<Job>(`/imports/${id}`)); } catch (e) { setError(catalogError(e)); } finally { setBusy(false); }
  }
  async function transition(action: 'confirm' | 'cancel') {
    if (!detail) return; setBusy(true); setError('');
    try { setDetail(await apiRequest<Job>(`/imports/${detail.id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'confirm' ? { previewToken: detail.previewToken } : {}) }, 75000)); setRevision(revision + 1); }
    catch (e) { setError(catalogError(e)); setUncertain(true); setRevision(revision + 1); } finally { setBusy(false); }
  }
  function download() {
    if (!definitions) return;
    const url = URL.createObjectURL(new Blob([definitions.types[type].columns.join(',') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${type.toLowerCase()}-template.csv`; link.click(); URL.revokeObjectURL(url);
  }
  const definition = definitions?.types[type]; const pages = Math.max(1, Math.ceil((history?.total ?? 0) / 20));
  return <div className="page-content import-page"><div className="page-heading"><div><h1>{c.title}</h1><p className="page-description">{c.description}</p></div></div>
    {!detail && error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={refresh}>{vi.admin.retry}</button></p>}
    <section className="admin-card import-upload"><form onSubmit={(e) => void upload(e)}><div className="admin-filters">
      <div className="form-field"><label htmlFor="import-type">{c.type}</label><select id="import-type" name="importType" value={type} disabled={busy} onChange={(e) => setType(e.target.value as ImportType)}>{Object.entries(c.types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="form-field"><label htmlFor="import-file">{c.file}</label><input id="import-file" name="file" type="file" accept=".csv,.xlsx" required disabled={busy} /></div>
      <button className="primary-button" disabled={busy || !definitions}>{busy ? c.processing : c.upload}</button>
    </div><p>{c.limits}</p><p>{c.historical}</p>{definition && <div className="import-template"><p>{definition.instructions}</p><p><strong>{c.required}: </strong>{definition.required.join(', ')}</p><button className="secondary-button" type="button" onClick={download}>{c.template}</button></div>}</form></section>
    <section className="admin-card"><div className="report-section-heading"><h2>{c.history}</h2><button className="secondary-button" disabled={busy} onClick={refresh}>{c.refresh}</button></div>
      {!history && !error && <p role="status" className="admin-loading">{c.loading}</p>}{history?.total === 0 && <p className="admin-loading">{c.empty}</p>}
      {!!history?.items.length && <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={c.history}><table className="admin-table"><thead><tr>{[c.fileName,c.type,c.status,c.total,c.success,c.failed,c.importer,c.created,vi.admin.actions].map((s) => <th key={s}>{s}</th>)}</tr></thead><tbody>{history.items.map((job) => <tr key={job.id}><th scope="row">{job.fileName}</th><td>{c.types[job.importType]}</td><td>{job.status}</td><td>{job.totalRows}</td><td>{job.successRows}</td><td>{job.failedRows}</td><td>{job.creator?.fullName ?? '—'}</td><td>{displayDate(job.createdAt)}</td><td><button className="text-button" disabled={busy} onClick={() => void open(job.id)}>{c.view}</button></td></tr>)}</tbody></table></div>}
      {history && <div className="admin-pagination"><p>{vi.admin.pagination(page, pages, history.total)}</p><div><button className="secondary-button" disabled={page === 1 || busy} onClick={() => { setHistory(null); setPage(page - 1); }}>{vi.admin.previous}</button><button className="secondary-button" disabled={page >= pages || busy} onClick={() => { setHistory(null); setPage(page + 1); }}>{vi.admin.next}</button></div></div>}
    </section>
    {detail && <AdminDialog titleId="import-review-title" busy={busy} onClose={() => { setDetail(null); setError(''); }}><div className="operation-dialog"><h2 id="import-review-title">{c.review}</h2><p>{detail.fileName} · {c.types[detail.importType]} · {detail.status}</p>
      {error && <p className="form-error" role="alert">{error}</p>}{uncertain && <p role="status">{c.uncertain}</p>}
      <div className="import-counts"><p>{c.total}: <strong>{detail.totalRows}</strong></p>{detail.status === 'PENDING' ? <><p>{c.valid}: <strong>{detail.validRows ?? '—'}</strong></p><p>{c.invalid}: <strong>{detail.invalidRows ?? '—'}</strong></p></> : <><p>{c.success}: <strong>{detail.successRows}</strong></p><p>{c.failed}: <strong>{detail.failedRows}</strong></p></>}</div>
      {detail.status === 'PENDING' && !detail.previewAvailable && <p>{c.expired}</p>}
      {detail.sampleRows && <><h3>{c.preview}</h3><div className="admin-table-scroll" tabIndex={0} role="region" aria-label={c.preview}><table className="admin-table"><thead><tr><th>{c.row}</th>{detail.columns?.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{detail.sampleRows.map((row) => <tr key={row.row} className={row.valid ? '' : 'import-invalid'}><th scope="row">{row.row}</th>{detail.columns?.map((column) => <td key={column}>{row.values[column] || '—'}</td>)}</tr>)}</tbody></table></div></>}
      {!!detail.errorReport?.length && <div className="import-errors admin-table-scroll" tabIndex={0} role="region" aria-label={c.error}><table className="admin-table"><thead><tr><th>{c.row}</th><th>{c.error}</th></tr></thead><tbody>{detail.errorReport.map((e, i) => <tr key={i}><td>{e.row || '—'}</td><td>{e.error}</td></tr>)}</tbody></table></div>}
      {detail.status === 'PENDING' && <p>{c.confirmHint}</p>}
      <div className="admin-form-actions"><button className="secondary-button" disabled={busy} onClick={() => { setDetail(null); setError(''); }}>{vi.catalog.close}</button>
        {detail.status === 'PENDING' && <><button className="text-button" disabled={busy || uncertain} onClick={() => void transition('cancel')}>{c.cancel}</button><button className="primary-button" disabled={busy || uncertain || !detail.previewAvailable || !detail.validRows} onClick={() => void transition('confirm')}>{busy ? c.processing : c.confirm}</button></>}
        {uncertain && <button className="secondary-button" disabled={busy} onClick={() => void open(detail.id)}>{c.refresh}</button>}
      </div></div></AdminDialog>}
  </div>;
}
