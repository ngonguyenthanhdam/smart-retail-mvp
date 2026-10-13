"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { allOptions, saveRecord, type Category, type Product, type Unit } from "@/lib/catalog";
import { vi } from "@/i18n/vi";
const c = vi.catalog; const a = vi.admin;
export const catalogError = (e: unknown) => e instanceof ApiRequestError && e.message ? e.message : a.requestFailed;

export function ProductForm({ id, onClose, onSaved }: { id?: string; onClose: () => void; onSaved: () => void }) {
  const [options, setOptions] = useState<{ categories: Category[]; units: Unit[]; record: Product | null } | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<object | null>(null); const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    Promise.all([allOptions<Category>("/categories", abort.signal), allOptions<Unit>("/units", abort.signal), id ? apiRequest<Product>(`/products/${id}`, { signal: abort.signal }) : Promise.resolve(null)])
      .then(([categories, units, record]) => { if (!abort.signal.aborted) setOptions({ categories, units, record }); })
      .catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [id, revision]);
  async function save(values: object) {
    setBusy(true); setError("");
    try { await saveRecord("/products", values, id); onSaved(); } catch (e) { setError(catalogError(e)); setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget); const v = (key: string) => String(f.get(key) ?? "").trim();
    const values = { sku: v("sku"), name: v("name"), barcode: v("barcode") || null, categoryId: v("categoryId"), baseUnitId: v("baseUnitId"), purchaseUnitId: v("purchaseUnitId"), purchaseToBaseRatio: v("purchaseToBaseRatio"), defaultCost: v("defaultCost"), trackExpiry: v("trackExpiry") === "true", shelfLifeDays: v("shelfLifeDays") === "" ? null : Number(v("shelfLifeDays")), isActive: v("isActive") === "true" };
    if (options?.record?.isActive && !values.isActive) setPending(values); else void save(values);
  }
  const record = options?.record;
  const ready = options && options.categories.length > 0 && options.units.length > 0;
  return <AdminDialog titleId="product-title" busy={busy} onClose={onClose}><h2 id="product-title">{pending ? c.deactivateProduct : id ? c.editProduct : c.addProduct}</h2>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!options && <p className="admin-loading">{error ? <button className="text-button" onClick={() => { setError(""); setRevision(revision + 1); }}>{a.retry}</button> : c.loading}</p>}
    {options && !ready && <p>{c.prerequisites}</p>}
    {options && <form className="admin-form" onSubmit={submit}><fieldset className="admin-fieldset" disabled={busy || !ready} hidden={!!pending}><div className="admin-form-grid">
      <div className="form-field"><label htmlFor="product-sku">{c.sku}</label><input id="product-sku" name="sku" required maxLength={50} defaultValue={record?.sku} autoFocus /></div>
      <div className="form-field"><label htmlFor="product-barcode">{c.barcode} {a.optional}</label><input id="product-barcode" name="barcode" maxLength={100} defaultValue={record?.barcode ?? ""} /></div>
      <div className="form-field admin-span-full"><label htmlFor="product-name">{c.name}</label><input id="product-name" name="name" required maxLength={200} defaultValue={record?.name} /></div>
      <div className="form-field"><label htmlFor="product-category">{c.category}</label><select id="product-category" name="categoryId" required defaultValue={record?.categoryId ?? ""}><option value="">{c.choose}</option>{options.categories.map((row) => <option key={row.id} value={row.id}>{row.name}{row.isActive ? "" : ` (${a.inactive})`}</option>)}</select></div>
      {([['baseUnitId', c.baseUnit], ['purchaseUnitId', c.purchaseUnit]] as const).map(([field, label]) => <div className="form-field" key={field}><label htmlFor={`product-${field}`}>{label}</label><select id={`product-${field}`} name={field} required defaultValue={record?.[field] ?? ""}><option value="">{c.choose}</option>{options.units.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></div>)}
      <div className="form-field"><label htmlFor="product-ratio">{c.ratio}</label><input id="product-ratio" name="purchaseToBaseRatio" type="number" min="0.0001" max="9999999999.9999" step="0.0001" required defaultValue={record?.purchaseToBaseRatio ?? "1"} /><p className="field-hint">{c.ratioHint}</p></div>
      <div className="form-field"><label htmlFor="product-cost">{c.cost}</label><input id="product-cost" name="defaultCost" type="number" min="0" max="999999999999.99" step="0.01" required defaultValue={record?.defaultCost ?? "0"} /></div>
      <div className="form-field"><label htmlFor="product-expiry">{c.trackExpiry}</label><select id="product-expiry" name="trackExpiry" defaultValue={String(!!record?.trackExpiry)}><option value="false">{c.no}</option><option value="true">{c.yes}</option></select></div>
      <div className="form-field"><label htmlFor="product-shelf">{c.shelfLife} {a.optional}</label><input id="product-shelf" name="shelfLifeDays" type="number" min="0" max="2147483647" step="1" defaultValue={record?.shelfLifeDays ?? ""} /></div>
      <div className="form-field"><label htmlFor="product-status">{a.status}</label><select id="product-status" name="isActive" defaultValue={String(record ? !!record.isActive : true)}><option value="true">{a.active}</option><option value="false">{a.inactive}</option></select></div>
    </div></fieldset>{pending && <p>{c.deactivateProductHint}</p>}
    <div className="admin-form-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => pending ? setPending(null) : onClose()}>{pending ? a.back : a.cancel}</button>{pending ? <button type="button" className="danger-button" disabled={busy} onClick={() => void save(pending)}>{busy ? a.saving : a.deactivate}</button> : <button className="primary-button" disabled={busy || !ready}>{busy ? a.saving : a.save}</button>}</div>
    </form>}{!options && <button className="secondary-button" onClick={onClose}>{a.cancel}</button>}
  </AdminDialog>;
}
