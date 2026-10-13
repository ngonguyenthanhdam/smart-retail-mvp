"use client";
import { useEffect, useState } from "react";
import { CatalogNav } from "@/components/catalog-nav";
import { catalogError } from "@/components/product-form";
import { StoreProductForm } from "@/components/store-product-form";
import { useAuth } from "@/components/auth-provider";
import { apiRequest } from "@/lib/api";
import { fetchStoreOptions } from "@/lib/users";
import type { Location } from "@/lib/locations";
import type { Page, StoreProduct } from "@/lib/catalog";
import { vi } from "@/i18n/vi";
import { CatalogCard, CatalogViewToggle } from './catalog-cards';
const c = vi.catalog; const a = vi.admin;

export function StoreProductsPage() {
  const { user } = useAuth(); const admin = user?.role === "ADMIN"; const canEdit = user?.role !== "STAFF";
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [stores, setStores] = useState<Location[] | null>(null);
  const [store, setStore] = useState("");
  const locationId = admin ? store : user?.locationId ?? "";
  const [query, setQuery] = useState({ search: "", status: "all", page: 1 });
  const [revision, setRevision] = useState(0); const [data, setData] = useState<Page<StoreProduct> | null>(null);
  const [error, setError] = useState(""); const [success, setSuccess] = useState(false); const [dialog, setDialog] = useState<StoreProduct | "new" | null>(null);
  useEffect(() => {
    if (!admin) return;
    const abort = new AbortController();
    fetchStoreOptions(abort.signal).then((rows) => { if (!abort.signal.aborted) { setStores(rows); setStore((current) => current || rows[0]?.id || ""); } }).catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [admin, revision]);
  useEffect(() => {
    if (!locationId) return;
    const abort = new AbortController();
    apiRequest<Page<StoreProduct>>(`/store-products?${new URLSearchParams({ ...query, locationId, page: String(query.page) })}`, { signal: abort.signal }).then((r) => { if (!abort.signal.aborted) setData(r); }).catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [query, locationId, revision]);
  function reload() { setData(null); setError(""); setRevision(revision + 1); }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  return <div className="page-content"><CatalogNav /><div className="page-heading"><div><h1>{admin ? c.storeProducts : c.products}</h1><p className="page-description">{admin ? c.storeDescription : c.ownProducts}</p></div>{canEdit && <button className="primary-button" disabled={!locationId} onClick={() => { setSuccess(false); setDialog("new"); }}>{c.addStoreProduct}</button>}</div>
    {success && <p className="form-success admin-notice" role="status">{c.saved}</p>}{error && <div className="form-error admin-notice" role="alert">{error} <button className="text-button" onClick={reload}>{a.retry}</button></div>}
    <section className="admin-card" aria-label={c.storeProducts}><form className="admin-filters" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setData(null); setError(""); setQuery({ search: String(f.get("search")), status: String(f.get("status") ?? "active"), page: 1 }); }}>
      {admin ? <div className="form-field"><label htmlFor="configuration-store">{c.store}</label><select id="configuration-store" value={store} onChange={(e) => { setStore(e.target.value); setData(null); setError(""); setSuccess(false); setQuery({ ...query, page: 1 }); }}><option value="">{c.selectStore}</option>{stores?.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></div> : <p>{user?.location?.name}</p>}
      <div className="form-field admin-search"><label htmlFor="store-product-search">{a.search}</label><input id="store-product-search" name="search" type="search" maxLength={150} placeholder={c.productSearch} /></div>
      {canEdit && <div className="form-field"><label htmlFor="store-product-filter">{a.status}</label><select id="store-product-filter" name="status"><option value="all">{a.allStatuses}</option><option value="active">{a.active}</option><option value="inactive">{a.inactive}</option></select></div>}<button className="secondary-button">{a.applyFilters}</button>
    </form>{admin && stores?.length === 0 && <div className="empty-state"><p>{c.noStores}</p></div>}
    {!data && !error && (locationId || (admin && !stores)) && <p className="admin-loading" role="status">{c.loading}</p>}
    {data?.items.length === 0 && <div className="empty-state"><h2>{c.empty}</h2><p>{c.emptyHint}</p></div>}
    {locationId && !!data?.items.length && <><div className="catalog-results-heading"><p><strong>{data.total}</strong> sản phẩm tại cửa hàng</p><CatalogViewToggle view={view} onChange={setView} /></div>{view === 'grid' ? <div className="catalog-product-grid">{data.items.map(row => <CatalogCard key={row.id} product={row.product} sellingPrice={row.sellingPrice} isActive={row.isActive && row.product.isActive} onEdit={canEdit ? () => { setSuccess(false); setDialog(row); } : undefined} />)}</div> : <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={c.storeProducts}><table className="admin-table"><thead><tr><th>{c.sku}</th><th>{c.product}</th><th>{c.category}</th><th>{c.sellingPrice}</th><th>{c.safetyStock}</th><th>{c.minStock}</th>{canEdit && <th>{c.cost}</th>}<th>{a.status}</th>{canEdit && <th>{a.actions}</th>}</tr></thead><tbody>{data.items.map((row) => <tr key={row.id}><td>{row.product.sku}</td><th scope="row">{row.product.name}<span className="admin-cell-note">{row.product.baseUnit?.symbol ?? row.product.baseUnit?.code}</span></th><td>{row.product.category?.name ?? a.noValue}</td><td>{row.sellingPrice}</td><td>{row.safetyStock ?? "0"}</td><td>{row.minStockLevel ?? "0"}</td>{canEdit && <td>{row.product.defaultCost ?? a.noValue}</td>}<td><span className={`record-status ${row.isActive && row.product.isActive ? "is-active" : "is-inactive"}`}>{!row.product.isActive ? c.productInactive : row.isActive ? a.active : a.inactive}</span></td>{canEdit && <td><button className="text-button" aria-label={a.editRecord(row.product.name)} onClick={() => { setSuccess(false); setDialog(row); }}>{a.edit}</button></td>}</tr>)}</tbody></table></div>}</>}
    {locationId && data && <div className="admin-pagination"><p>{a.pagination(data.page, pages, data.total)}</p><div><button className="secondary-button" disabled={query.page <= 1} onClick={() => { setData(null); setQuery({ ...query, page: query.page - 1 }); }}>{a.previous}</button><button className="secondary-button" disabled={query.page >= pages} onClick={() => { setData(null); setQuery({ ...query, page: query.page + 1 }); }}>{a.next}</button></div></div>}
    </section>{dialog && <StoreProductForm locationId={locationId} record={dialog === "new" ? undefined : dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setSuccess(true); reload(); }} />}
  </div>;
}
