"use client";
import { useEffect, useState } from "react";
import { CatalogNav } from "@/components/catalog-nav";
import { ProductForm, catalogError } from "@/components/product-form";
import { useAuth } from "@/components/auth-provider";
import { apiRequest } from "@/lib/api";
import { allOptions, type Category, type Page, type Product } from "@/lib/catalog";
import { vi } from "@/i18n/vi";
import { StoreProductsPage } from "@/components/store-products-page";
import { CatalogCard, CatalogViewToggle } from './catalog-cards';
import { Plus } from 'lucide-react';
const c = vi.catalog; const a = vi.admin;

export function ProductsPage() {
  const { user } = useAuth();
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [query, setQuery] = useState({ search: "", status: "all", categoryId: "", page: 1 });
  const [revision, setRevision] = useState(0); const [data, setData] = useState<Page<Product> | null>(null);
  const [categories, setCategories] = useState<Category[]>([]); const [error, setError] = useState("");
  const [success, setSuccess] = useState(false); const [dialog, setDialog] = useState<string | null>(null);
  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    const abort = new AbortController();
    Promise.all([apiRequest<Page<Product>>(`/products?${new URLSearchParams({ ...query, page: String(query.page) })}`, { signal: abort.signal }), allOptions<Category>("/categories", abort.signal)])
      .then(([records, options]) => { if (!abort.signal.aborted) { setData(records); setCategories(options); } }).catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [query, revision, user?.role]);
  function reload() { setData(null); setError(""); setRevision(revision + 1); }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  if (user?.role !== "ADMIN") return <StoreProductsPage />;
  return <div className="page-content catalog-page"><div className="page-heading"><div><p className="eyebrow">HÀNG HÓA CỦA BẠN</p><h1>{c.products}</h1><p className="page-description">{c.productsDescription}</p></div><button className="primary-button" onClick={() => { setSuccess(false); setDialog("new"); }}><Plus size={18} />{c.addProduct}</button></div><CatalogNav />
    {success && <p className="form-success admin-notice" role="status">{c.saved}</p>}{error && <div className="form-error admin-notice" role="alert">{error} <button className="text-button" onClick={reload}>{a.retry}</button></div>}
    <section className="admin-card" aria-label={c.products}><form className="admin-filters" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setData(null); setError(""); setQuery({ search: String(f.get("search")), status: String(f.get("status")), categoryId: String(f.get("categoryId")), page: 1 }); }}>
      <div className="form-field admin-search"><label htmlFor="products-search">{a.search}</label><input id="products-search" name="search" type="search" maxLength={150} placeholder={c.productSearch} /></div>
      <div className="form-field"><label htmlFor="products-category">{c.category}</label><select id="products-category" name="categoryId"><option value="">{c.allCategories}</option>{categories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
      <div className="form-field"><label htmlFor="products-status">{a.status}</label><select id="products-status" name="status"><option value="all">{a.allStatuses}</option><option value="active">{a.active}</option><option value="inactive">{a.inactive}</option></select></div><button className="secondary-button">{a.applyFilters}</button>
    </form>{!data && !error && <p className="admin-loading" role="status">{c.loading}</p>}{data?.items.length === 0 && <div className="empty-state"><h2>{c.empty}</h2><p>{c.emptyHint}</p></div>}
    {!!data?.items.length && <><div className="catalog-results-heading"><p><strong>{data.total}</strong> sản phẩm trong danh mục</p><CatalogViewToggle view={view} onChange={setView} /></div>{view === 'grid' ? <div className="catalog-product-grid">{data.items.map(row => <CatalogCard key={row.id} product={row} onEdit={() => { setSuccess(false); setDialog(row.id); }} />)}</div> : <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={c.products}><table className="admin-table"><thead><tr><th>{c.sku}</th><th>{c.name}</th><th>{c.category}</th><th>{c.baseUnit}</th><th>{c.cost}</th><th>{c.trackExpiry}</th><th>{a.status}</th><th>{a.actions}</th></tr></thead><tbody>{data.items.map((row) => <tr key={row.id}><td>{row.sku}</td><th scope="row">{row.name}<span className="admin-cell-note">{row.barcode}</span></th><td>{row.category?.name ?? a.noValue}</td><td>{row.baseUnit?.symbol ?? row.baseUnit?.code ?? a.noValue}</td><td>{row.defaultCost ?? a.noValue}</td><td>{row.trackExpiry ? c.yes : c.no}</td><td><span className={`record-status ${row.isActive ? "is-active" : "is-inactive"}`}>{row.isActive ? a.active : a.inactive}</span></td><td><button className="text-button" aria-label={a.editRecord(row.name)} onClick={() => { setSuccess(false); setDialog(row.id); }}>{a.edit}</button></td></tr>)}</tbody></table></div>}</>}
    {data && <div className="admin-pagination"><p>{a.pagination(data.page, pages, data.total)}</p><div><button className="secondary-button" disabled={query.page <= 1} onClick={() => { setData(null); setQuery({ ...query, page: query.page - 1 }); }}>{a.previous}</button><button className="secondary-button" disabled={query.page >= pages} onClick={() => { setData(null); setQuery({ ...query, page: query.page + 1 }); }}>{a.next}</button></div></div>}
    </section>{dialog && <ProductForm id={dialog === "new" ? undefined : dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setSuccess(true); reload(); }} />}
  </div>;
}
