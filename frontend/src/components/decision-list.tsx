"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './auth-provider';
import { catalogError } from './product-form';
import { apiRequest } from '@/lib/api';
import { allOptions, type Page } from '@/lib/catalog';
import type { Location } from '@/lib/locations';
import { vi, decisionCopy as c } from '@/i18n/vi';
import { planningCopy as p } from '@/i18n/planning';

type DecisionPage<T> = Page<T> & { summary?: Record<string, number>; businessDate?: string };

export function useDecisionList<T>(path: string, defaultStatus = 'all', initialFilter: { locationId?: string; search?: string } = {}) {
  const { user } = useAuth(); const admin = user?.role === 'ADMIN';
  const [stores,setStores] = useState<Location[]>([]);
  const [query,setQuery] = useState({ locationId: initialFilter.locationId ?? '', status: defaultStatus, search: initialFilter.search ?? '', alertType: '', page: 1 });
  const [revision,setRevision] = useState(0); const [data,setData] = useState<DecisionPage<T> | null>(null); const [error,setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ page: String(query.page), status: query.status, search: query.search });
    if (query.locationId) params.set('locationId',query.locationId);
    if (query.alertType) params.set('alertType',query.alertType);
    apiRequest<DecisionPage<T>>(`${path}?${params}`,{ signal: abort.signal }).then(value => { if (!abort.signal.aborted) setData(value); })
      .catch(e => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  },[path,query,revision,user?.locationId]);
  useEffect(() => {
    if (!admin) return;
    const abort = new AbortController();
    allOptions<Location>('/locations',abort.signal).then(values => { if (!abort.signal.aborted) setStores(values.filter(s => s.locationType === 'STORE')); }).catch(e => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  },[admin]);
  function refresh() { setError(''); setData(null); setRevision(v => v+1); }
  return { user, admin, stores, query, setQuery, data, setData, error, setError, refresh };
}
export function DecisionList<T extends { id: string }>({ state, statuses, card, busy, alertFilters = false }: {
  state: ReturnType<typeof useDecisionList<T>>; statuses: (keyof typeof c.statuses)[]; card: (record: T) => ReactNode; busy: boolean; alertFilters?: boolean;
}) {
  const { query, data } = state; const pages = Math.max(1,Math.ceil((data?.total ?? 0)/(data?.pageSize ?? 20)));
  const [storeFilter,setStoreFilter] = useState(query.locationId);
  return <section className="decision-results">
    <form className="admin-filters admin-card" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); state.setData(null); state.setError(''); state.setQuery({ locationId: String(form.get('locationId') ?? query.locationId), status: String(form.get('status')), search: String(form.get('search') ?? ''), alertType: String(form.get('alertType') ?? ''), page: 1 }); }}>
      <div className="form-field admin-search"><label htmlFor="decision-search">{p.search}</label><input id="decision-search" name="search" defaultValue={query.search} maxLength={150} /></div>
      {state.admin ? <div className="form-field"><label htmlFor="decision-store">{c.store}</label><select id="decision-store" name="locationId" value={storeFilter} onChange={e => setStoreFilter(e.target.value)}><option value="">{c.allStores}</option>{state.stores.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></div> : <p>{state.user?.location?.name}</p>}
      <div className="form-field"><label htmlFor="decision-status">{c.status}</label><select id="decision-status" name="status" defaultValue={query.status}><option value="all">{c.all}</option>{statuses.map(s => <option key={s} value={s}>{s === 'RESOLVED' ? p.resolved : c.statuses[s]}</option>)}</select></div>
      {alertFilters && <div className="form-field"><label htmlFor="decision-type">{p.type}</label><select id="decision-type" name="alertType" defaultValue={query.alertType}><option value="">{p.allTypes}</option>{Object.entries(c.types).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
      <button className="secondary-button" disabled={busy}>{c.filter}</button>
    </form>
    {state.error && <p className="form-error decision-hint" role="alert">{state.error} <button className="text-button" disabled={busy} onClick={state.refresh}>{vi.admin.retry}</button></p>}
    {!data && !state.error && <p className="admin-loading" role="status">{c.loading}</p>}
    {data?.items.length === 0 && <p className="report-empty">{c.empty}</p>}
    {!!data?.items.length && <div className="decision-card-grid">{data.items.map(item => <div key={item.id}>{card(item)}</div>)}</div>}
    {data && <div className="admin-pagination"><p>{vi.admin.pagination(data.page,pages,data.total)}</p><div><button className="secondary-button" disabled={busy || query.page <= 1} onClick={() => { state.setData(null); state.setQuery({ ...query, page: query.page-1 }); }}>{vi.admin.previous}</button><button className="secondary-button" disabled={busy || query.page >= pages} onClick={() => { state.setData(null); state.setQuery({ ...query, page: query.page+1 }); }}>{vi.admin.next}</button></div></div>}
  </section>;
}
