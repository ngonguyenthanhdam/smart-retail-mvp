"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { CatalogNav } from "@/components/catalog-nav";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { allOptions, saveRecord, type Category, type Page } from "@/lib/catalog";
import { vi } from "@/i18n/vi";
const c = vi.catalog;
const a = vi.admin;
const message = (error: unknown) => error instanceof ApiRequestError && error.message ? error.message : a.requestFailed;

function CategoryForm({ record, onClose, onSaved }: { record?: Category; onClose: () => void; onSaved: () => void }) {
  const [parents, setParents] = useState<Category[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<object | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    allOptions<Category>("/categories", abort.signal).then(setParents).catch((e) => { if (!abort.signal.aborted) setError(message(e)); });
    return () => abort.abort();
  }, [attempt]);
  async function save(values: object) {
    setBusy(true); setError("");
    try { await saveRecord("/categories", values, record?.id); onSaved(); }
    catch (e) { setError(message(e)); setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = { code: String(form.get("code")).trim(), name: String(form.get("name")).trim(), parentId: form.get("parentId") || null, isActive: form.get("isActive") === "true" };
    if (record?.isActive && !values.isActive) setPending(values); else void save(values);
  }
  return <AdminDialog titleId="category-title" busy={busy} onClose={onClose}>
    <h2 id="category-title">{pending ? c.deactivateCategory : record ? c.editCategory : c.addCategory}</h2>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!parents && <button className="secondary-button" onClick={() => { setError(""); setAttempt(attempt + 1); }}>{error ? a.retry : c.loading}</button>}
    <form className="admin-form" onSubmit={submit}>
      <fieldset className="admin-fieldset" disabled={busy || !parents} hidden={!!pending}>
        <div className="admin-form-grid">
          <div className="form-field"><label htmlFor="category-code">{c.code}</label><input id="category-code" name="code" required maxLength={50} defaultValue={record?.code} autoFocus /></div>
          <div className="form-field"><label htmlFor="category-name">{c.name}</label><input id="category-name" name="name" required maxLength={150} defaultValue={record?.name} /></div>
          <div className="form-field"><label htmlFor="category-parent">{c.parent}</label><select id="category-parent" name="parentId" defaultValue={record?.parentId ?? ""}><option value="">{c.noParent}</option>{parents?.filter((p) => p.id !== record?.id).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}{p.isActive ? "" : ` (${a.inactive})`}</option>)}</select></div>
          <div className="form-field"><label htmlFor="category-status">{a.status}</label><select id="category-status" name="isActive" defaultValue={String(record ? !!record.isActive : true)}><option value="true">{a.active}</option><option value="false">{a.inactive}</option></select></div>
        </div>
      </fieldset>
      {pending && <p>{c.deactivationHint}</p>}
      <div className="admin-form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => pending ? setPending(null) : onClose()}>{pending ? a.back : a.cancel}</button>
        {pending ? <button type="button" className="danger-button" disabled={busy} onClick={() => void save(pending)}>{busy ? a.saving : a.deactivate}</button> : <button className="primary-button" disabled={busy || !parents}>{busy ? a.saving : a.save}</button>}
      </div>
    </form>
  </AdminDialog>;
}

export function CategoriesPage() {
  const [query, setQuery] = useState({ search: "", status: "all", page: 1 });
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Page<Category> | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [dialog, setDialog] = useState<Category | "new" | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    apiRequest<Page<Category>>(`/categories?${new URLSearchParams({ ...query, page: String(query.page) })}`, { signal: abort.signal }).then((result) => {
      if (!abort.signal.aborted) setData(result);
    }).catch((e) => { if (!abort.signal.aborted) setError(message(e)); });
    return () => abort.abort();
  }, [query, revision]);
  function reload() { setData(null); setError(""); setRevision(revision + 1); }
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setData(null); setError("");
    setQuery({ search: String(form.get("search") ?? ""), status: String(form.get("status")), page: 1 });
  }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  return <div className="page-content"><CatalogNav /><div className="page-heading"><div><h1>{c.categories}</h1><p className="page-description">{c.categoriesDescription}</p></div><button className="primary-button" onClick={() => { setSuccess(false); setDialog("new"); }}>{c.addCategory}</button></div>
    {success && <p role="status" className="form-success admin-notice">{c.saved}</p>}
    {error && <div role="alert" className="form-error admin-notice">{error} <button className="text-button" onClick={reload}>{a.retry}</button></div>}
    <section className="admin-card" aria-label={c.categories}>
      <form className="admin-filters" onSubmit={filter}><div className="form-field admin-search"><label htmlFor="category-search">{a.search}</label><input id="category-search" name="search" type="search" maxLength={150} placeholder={c.search} /></div><div className="form-field"><label htmlFor="category-filter">{a.status}</label><select id="category-filter" name="status"><option value="all">{a.allStatuses}</option><option value="active">{a.active}</option><option value="inactive">{a.inactive}</option></select></div><button className="secondary-button">{a.applyFilters}</button></form>
      {!data && !error && <p className="admin-loading" role="status">{c.loading}</p>}
      {data?.items.length === 0 && <div className="empty-state"><h2>{c.empty}</h2><p>{c.emptyHint}</p></div>}
      {!!data?.items.length && <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={c.categories}><table className="admin-table"><thead><tr><th>{c.code}</th><th>{c.name}</th><th>{c.parent}</th><th>{a.status}</th><th>{a.actions}</th></tr></thead><tbody>{data.items.map((row) => <tr key={row.id}><td>{row.code}</td><th scope="row">{row.name}</th><td>{row.parent?.name ?? a.noValue}</td><td><span className={`record-status ${row.isActive ? "is-active" : "is-inactive"}`}>{row.isActive ? a.active : a.inactive}</span></td><td><button className="text-button" aria-label={a.editRecord(row.name)} onClick={() => { setSuccess(false); setDialog(row); }}>{a.edit}</button></td></tr>)}</tbody></table></div>}
      {data && <div className="admin-pagination"><p>{a.pagination(data.page, pages, data.total)}</p><div><button className="secondary-button" disabled={query.page <= 1} onClick={() => { setData(null); setQuery({ ...query, page: query.page - 1 }); }}>{a.previous}</button><button className="secondary-button" disabled={query.page >= pages} onClick={() => { setData(null); setQuery({ ...query, page: query.page + 1 }); }}>{a.next}</button></div></div>}
    </section>
    {dialog && <CategoryForm record={dialog === "new" ? undefined : dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setSuccess(true); reload(); }} />}
  </div>;
}
