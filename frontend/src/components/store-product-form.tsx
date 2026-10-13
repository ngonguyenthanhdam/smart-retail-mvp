"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { catalogError } from "@/components/product-form";
import { allOptions, saveRecord, type Product, type StoreProduct } from "@/lib/catalog";
import { vi } from "@/i18n/vi";
const c = vi.catalog; const a = vi.admin;
export function StoreProductForm({ record, locationId, onClose, onSaved }: { record?: StoreProduct; locationId: string; onClose: () => void; onSaved: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(record ? [record.product] : null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [pending, setPending] = useState<object | null>(null); const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (record) return;
    const abort = new AbortController();
    allOptions<Product>("/products?available=true&status=active", abort.signal).then((rows) => { if (!abort.signal.aborted) setProducts(rows); }).catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [record, revision]);
  async function save(values: object) {
    setBusy(true); setError("");
    try { await saveRecord("/store-products", values, record?.id); onSaved(); } catch (e) { setBusy(false); setError(catalogError(e)); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget); const v = (key: string) => String(f.get(key) ?? "");
    const values = { ...(!record ? { locationId, productId: v("productId") } : {}), sellingPrice: v("sellingPrice"), safetyStock: v("safetyStock"), minStockLevel: v("minStockLevel"), isActive: v("isActive") === "true" };
    if (record?.isActive && !values.isActive) setPending(values); else void save(values);
  }
  return <AdminDialog titleId="store-product-title" busy={busy} onClose={onClose}><h2 id="store-product-title">{pending ? c.deactivateStoreProduct : record ? c.editStoreProduct : c.addStoreProduct}</h2>
    {error && <p role="alert" className="form-error">{error}</p>}{!products && <p>{error ? <button className="text-button" onClick={() => { setError(""); setRevision(revision + 1); }}>{a.retry}</button> : c.loading}</p>}
    <form className="admin-form" onSubmit={submit}><fieldset className="admin-fieldset" disabled={busy || !products} hidden={!!pending}><div className="admin-form-grid">
      <div className="form-field admin-span-full"><label htmlFor="store-product-select">{c.product}</label><select id="store-product-select" name="productId" required disabled={!!record} defaultValue={record?.productId ?? ""}><option value="">{c.choose}</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></div>
      {([['sellingPrice', c.sellingPrice, '0.01'], ['safetyStock', c.safetyStock, '0.0001'], ['minStockLevel', c.minStock, '0.0001']] as const).map(([field, label, step]) => <div className="form-field" key={field}><label htmlFor={`store-${field}`}>{label}</label><input id={`store-${field}`} name={field} type="number" required min="0" max={step === '0.01' ? '999999999999.99' : '9999999999.9999'} step={step} defaultValue={record?.[field] ?? "0"} /></div>)}
      <div className="form-field"><label htmlFor="store-product-status">{a.status}</label><select id="store-product-status" name="isActive" defaultValue={String(record ? !!record.isActive : true)}><option value="true">{a.active}</option><option value="false">{a.inactive}</option></select></div>
    </div></fieldset>{pending && <p>{c.deactivateStoreHint}</p>}
    <div className="admin-form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => pending ? setPending(null) : onClose()}>{pending ? a.back : a.cancel}</button>{pending ? <button type="button" className="danger-button" disabled={busy} onClick={() => void save(pending)}>{busy ? a.saving : a.deactivate}</button> : <button className="primary-button" disabled={busy || !products?.length}>{busy ? a.saving : a.save}</button>}</div>
    </form>
  </AdminDialog>;
}
