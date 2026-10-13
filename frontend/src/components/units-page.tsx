"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { CatalogNav } from "@/components/catalog-nav";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { saveRecord, type Unit, type Page } from "@/lib/catalog";
import { vi } from "@/i18n/vi";
const c = vi.catalog;
const a = vi.admin;
const message = (e: unknown) => e instanceof ApiRequestError && e.message ? e.message : a.requestFailed;

function UnitForm({ record, onClose, onSaved }: { record?: Unit; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try { await saveRecord("/units", { code: String(form.get("code")).trim(), name: String(form.get("name")).trim(), symbol: String(form.get("symbol")).trim() || null, allowFraction: form.get('allowFraction') === 'on' }, record?.id); onSaved(); }
    catch (e) { setError(message(e)); setBusy(false); }
  }
  return <AdminDialog titleId="unit-title" busy={busy} onClose={onClose}><h2 id="unit-title">{record ? c.editUnit : c.addUnit}</h2>
    <form className="admin-form" onSubmit={submit}><fieldset className="admin-fieldset" disabled={busy}><div className="admin-form-grid">
      <div className="form-field"><label htmlFor="unit-code">{c.code}</label><input id="unit-code" name="code" required maxLength={30} defaultValue={record?.code} autoFocus /></div>
      <div className="form-field"><label htmlFor="unit-name">{c.name}</label><input id="unit-name" name="name" required maxLength={100} defaultValue={record?.name} /></div>
      <div className="form-field"><label htmlFor="unit-symbol">{c.symbol} {a.optional}</label><input id="unit-symbol" name="symbol" maxLength={20} defaultValue={record?.symbol ?? ""} /></div>
      <div className="form-field admin-span-full"><label className="inventory-checkbox"><input type="checkbox" name="allowFraction" defaultChecked={record?.allowFraction ?? false} />Cho phép số lượng lẻ (ví dụ 0,5 kg)</label><p className="field-hint">Bỏ chọn cho đơn vị đếm như cái, lon, bó hoặc bịch.</p></div>
    </div></fieldset>{error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{a.cancel}</button><button className="primary-button" disabled={busy}>{busy ? a.saving : a.save}</button></div></form>
  </AdminDialog>;
}

export function UnitsPage() {
  const [query, setQuery] = useState({ search: "", page: 1 });
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Page<Unit> | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [dialog, setDialog] = useState<Unit | "new" | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    apiRequest<Page<Unit>>(`/units?${new URLSearchParams({ search: query.search, page: String(query.page) })}`, { signal: abort.signal }).then((r) => { if (!abort.signal.aborted) setData(r); }).catch((e) => { if (!abort.signal.aborted) setError(message(e)); });
    return () => abort.abort();
  }, [query, revision]);
  function reload() { setData(null); setError(""); setRevision(revision + 1); }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  return <div className="page-content"><CatalogNav /><div className="page-heading"><div><h1>{c.units}</h1><p className="page-description">{c.unitsDescription}</p></div><button className="primary-button" onClick={() => { setSuccess(false); setDialog("new"); }}>{c.addUnit}</button></div>
    {success && <p className="form-success admin-notice" role="status">{c.saved}</p>}{error && <div role="alert" className="form-error admin-notice">{error} <button className="text-button" onClick={reload}>{a.retry}</button></div>}
    <section className="admin-card" aria-label={c.units}><form className="admin-filters" onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); setData(null); setError(""); setQuery({ search: String(form.get("search")), page: 1 }); }}><div className="form-field admin-search"><label htmlFor="unit-search">{a.search}</label><input id="unit-search" name="search" type="search" maxLength={150} placeholder={c.search} /></div><button className="secondary-button">{a.applyFilters}</button></form>
      {!data && !error && <p className="admin-loading" role="status">{c.loading}</p>}
      {data?.items.length === 0 && <div className="empty-state"><h2>{c.empty}</h2><p>{c.emptyHint}</p></div>}
      {!!data?.items.length && <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={c.units}><table className="admin-table"><thead><tr><th>{c.code}</th><th>{c.name}</th><th>{c.symbol}</th><th>{a.actions}</th></tr></thead><tbody>{data.items.map((row) => <tr key={row.id}><td>{row.code}</td><th scope="row">{row.name}</th><td>{row.symbol ?? a.noValue}</td><td><button className="text-button" aria-label={a.editRecord(row.name)} onClick={() => { setSuccess(false); setDialog(row); }}>{a.edit}</button></td></tr>)}</tbody></table></div>}
      {data && <div className="admin-pagination"><p>{a.pagination(data.page, pages, data.total)}</p><div><button className="secondary-button" disabled={query.page <= 1} onClick={() => { setData(null); setQuery({ ...query, page: query.page - 1 }); }}>{a.previous}</button><button className="secondary-button" disabled={query.page >= pages} onClick={() => { setData(null); setQuery({ ...query, page: query.page + 1 }); }}>{a.next}</button></div></div>}
    </section>{dialog && <UnitForm record={dialog === "new" ? undefined : dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setSuccess(true); reload(); }} />}
  </div>;
}
