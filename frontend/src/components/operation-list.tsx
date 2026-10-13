"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { catalogError } from "@/components/product-form";
import { apiRequest } from "@/lib/api";
import { allOptions, type Page } from "@/lib/catalog";
import type { Location } from "@/lib/locations";
import { vi } from "@/i18n/vi";
const o = vi.operations; const a = vi.admin;
export function OperationList<T extends { id: string }>({ path, title, description, createLabel, onCreate, revision, statuses = [], columns, row }: {
  path: string; title: string; description: string; createLabel?: string; onCreate?: () => void; revision: number;
  statuses?: (keyof typeof o.status)[]; columns: string[]; row: (record: T) => ReactNode;
}) {
  const { user } = useAuth(); const admin = user?.role === "ADMIN";
  const [locations, setLocations] = useState<Location[]>([]);
  const [query, setQuery] = useState({ search: "", status: "all", locationId: "", from: "", to: "", page: 1 });
  const [retry, setRetry] = useState(0); const [data, setData] = useState<Page<T> | null>(null); const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => { if (value !== "") params.set(key, String(value)); });
    apiRequest<Page<T>>(`${path}?${params}`, { signal: abort.signal }).then((value) => { if (!abort.signal.aborted) { setData(value); setError(""); } }).catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [path, query, retry, revision]);
  useEffect(() => {
    if (!admin) return;
    const abort = new AbortController();
    allOptions<Location>("/locations", abort.signal).then((value) => { if (!abort.signal.aborted) setLocations(value); }).catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [admin, retry]);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  return <><div className="page-heading"><div><h1>{title}</h1><p className="page-description">{description}</p></div>{onCreate && <button className="primary-button" onClick={onCreate}>{createLabel}</button>}</div>
    {error && <p className="form-error admin-notice" role="alert">{error} <button className="text-button" onClick={() => { setError(""); setData(null); setRetry(retry + 1); }}>{a.retry}</button></p>}
    <section className="admin-card" aria-label={title}><form className="admin-filters" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const v = (key: string) => String(f.get(key) ?? ""); setData(null); setQuery({ search: v("search"), status: v("status") || "all", locationId: v("locationId"), from: v("from"), to: v("to"), page: 1 }); }}>
      <div className="form-field admin-search"><label htmlFor="operation-search">{a.search}</label><input id="operation-search" name="search" type="search" maxLength={150} /></div>
      {admin ? <div className="form-field"><label htmlFor="operation-location">{o.location}</label><select id="operation-location" name="locationId"><option value="">{o.allLocations}</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</select></div> : <p>{user?.location?.name}</p>}
      {!!statuses.length && <div className="form-field"><label htmlFor="operation-status">{a.status}</label><select id="operation-status" name="status"><option value="all">{a.allStatuses}</option>{statuses.map((s) => <option key={s} value={s}>{o.status[s]}</option>)}</select></div>}
      <div className="form-field"><label htmlFor="operation-from">{o.from}</label><input id="operation-from" name="from" type="date" /></div><div className="form-field"><label htmlFor="operation-to">{o.to}</label><input id="operation-to" name="to" type="date" /></div><button className="secondary-button">{a.applyFilters}</button>
    </form>{!data && !error && <p className="admin-loading" role="status">{vi.catalog.loading}</p>}
    {data?.items.length === 0 && <div className="empty-state"><h2>{vi.catalog.empty}</h2><p>{vi.catalog.emptyHint}</p></div>}
    {!!data?.items.length && <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={title}><table className="admin-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{data.items.map((record) => <tr key={record.id}>{row(record)}</tr>)}</tbody></table></div>}
    {data && <div className="admin-pagination"><p>{a.pagination(data.page, pages, data.total)}</p><div><button className="secondary-button" disabled={query.page <= 1} onClick={() => { setData(null); setQuery({ ...query, page: query.page - 1 }); }}>{a.previous}</button><button className="secondary-button" disabled={query.page >= pages} onClick={() => { setData(null); setQuery({ ...query, page: query.page + 1 }); }}>{a.next}</button></div></div>}</section>
  </>;
}
