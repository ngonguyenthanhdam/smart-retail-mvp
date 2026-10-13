"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { useAuth } from "@/components/auth-provider";
import { catalogError } from "@/components/product-form";
import { allOptions, saveRecord, type Product } from "@/lib/catalog";
import type { Location } from "@/lib/locations";
import { localDate, type PurchaseDetail } from "@/lib/operations";
import { vi } from "@/i18n/vi";
const o = vi.operations; const c = vi.catalog; const a = vi.admin;
type Line = { key: string; productId: string; purchaseQuantity: string; unitCost: string; lotNumber: string; expiryDate: string };
const newLine = (): Line => ({ key: crypto.randomUUID(), productId: "", purchaseQuantity: "1", unitCost: "0", lotNumber: "", expiryDate: "" });
export function PurchaseForm({ record, onClose, onSaved }: { record?: PurchaseDetail; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth(); const admin = user?.role === "ADMIN";
  const [products, setProducts] = useState<Product[] | null>(null); const [locations, setLocations] = useState<Location[]>([]);
  const [lines, setLines] = useState<Line[]>(() => record ? record.items.map((i) => ({ key: i.id, productId: i.productId, purchaseQuantity: i.purchaseQuantity, unitCost: i.unitCost, lotNumber: i.lotNumber ?? "", expiryDate: i.expiryDate?.slice(0, 10) ?? "" })) : [newLine()]);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    Promise.all([allOptions<Product>("/products?available=true", abort.signal), admin ? allOptions<Location>("/locations?status=active", abort.signal) : Promise.resolve([])]).then(([p, l]) => { if (!abort.signal.aborted) { setProducts(p); setLocations(l); } }).catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [admin, revision]);
  function update(key: string, field: keyof Line, value: string) { setLines(lines.map((line) => line.key === key ? { ...line, [field]: value } : line)); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget); setBusy(true); setError("");
    const date = String(f.get("orderedAt"));
    try {
      await saveRecord("/purchases", { locationId: record?.replenishmentRecommendationId ? record.locationId : admin ? String(f.get("locationId")) : user?.locationId, orderedAt: record && date === localDate(record.orderedAt) ? record.orderedAt : `${date}T00:00:00+07:00`, note: String(f.get("note") ?? ""), items: lines.map(({ productId, purchaseQuantity, unitCost, lotNumber, expiryDate }) => ({ productId, purchaseQuantity, unitCost, lotNumber: lotNumber || null, expiryDate: expiryDate || null })) }, record?.id);
      onSaved();
    } catch (e) { setError(catalogError(e)); setBusy(false); }
  }
  return <AdminDialog titleId="purchase-form-title" busy={busy} onClose={onClose}><div className="operation-dialog"><h2 id="purchase-form-title">{record ? o.editPurchase : o.newPurchase}</h2>
    {error && <p className="form-error" role="alert">{error}</p>}{!products && <p>{error ? <button className="text-button" onClick={() => { setError(""); setRevision(revision + 1); }}>{a.retry}</button> : c.loading}</p>}
    {products?.length === 0 && <p>{o.noProducts}</p>}
    <form className="admin-form" onSubmit={submit}><fieldset className="admin-fieldset" disabled={busy || !products}><div className="admin-form-grid">
      {admin ? <div className="form-field"><label htmlFor="purchase-location">{o.location}</label><select id="purchase-location" name="locationId" required disabled={!!record?.replenishmentRecommendationId} defaultValue={record?.locationId ?? ""}><option value="">{o.chooseLocation}</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</select></div> : <p>{user?.location?.name}</p>}
      <div className="form-field"><label htmlFor="purchase-date">{o.orderedAt}</label><input id="purchase-date" name="orderedAt" required type="date" defaultValue={localDate(record?.orderedAt)} /></div>
      <div className="form-field admin-span-full"><label htmlFor="purchase-note">{o.note}</label><textarea id="purchase-note" name="note" maxLength={4000} defaultValue={record?.note ?? ""} /></div>
    </div><h3>{o.items}</h3><div className="operation-lines">{lines.map((line, index) => { const product = products?.find((p) => p.id === line.productId); return <fieldset className="operation-line" key={line.key}><legend>{o.items} {index + 1}</legend><div className="admin-form-grid">
      <div className="form-field admin-span-full"><label htmlFor={`purchase-product-${index}`}>{c.product}</label><select id={`purchase-product-${index}`} required disabled={!!record?.replenishmentRecommendationId} value={line.productId} onChange={(e) => update(line.key, "productId", e.target.value)}><option value="">{c.choose}</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></div>
      <div className="form-field"><label htmlFor={`purchase-quantity-${index}`}>{o.purchaseQuantity} {product?.purchaseUnit ? `(${product.purchaseUnit.code})` : ""}</label><input id={`purchase-quantity-${index}`} type="number" min="0.0001" max="9999999999.9999" step="0.0001" required value={line.purchaseQuantity} onChange={(e) => update(line.key, "purchaseQuantity", e.target.value)} /></div>
      <div className="form-field"><label htmlFor={`purchase-cost-${index}`}>{o.purchaseCost}</label><input id={`purchase-cost-${index}`} type="number" min="0" max="999999999999.99" step="0.01" required value={line.unitCost} onChange={(e) => update(line.key, "unitCost", e.target.value)} /></div>
      <div className="form-field"><label htmlFor={`purchase-lot-${index}`}>{vi.inventory.lotNumber}</label><input id={`purchase-lot-${index}`} maxLength={100} value={line.lotNumber} onChange={(e) => update(line.key, "lotNumber", e.target.value)} /></div>
      <div className="form-field"><label htmlFor={`purchase-expiry-${index}`}>{vi.inventory.expiryDate}{product?.trackExpiry ? " *" : ""}</label><input id={`purchase-expiry-${index}`} type="date" value={line.expiryDate} onChange={(e) => update(line.key, "expiryDate", e.target.value)} /></div>
    </div><p>{o.baseQuantity}: {(Number(line.purchaseQuantity) * Number(product?.purchaseToBaseRatio ?? 0)).toFixed(4)} {product?.baseUnit?.code} · {o.lineTotal}: {(Number(line.purchaseQuantity) * Number(line.unitCost)).toFixed(2)}</p><button type="button" className="text-button" disabled={!!record?.replenishmentRecommendationId || lines.length <= 1} onClick={() => setLines(lines.filter((l) => l.key !== line.key))}>{o.remove}</button></fieldset>; })}</div>
    <button type="button" className="secondary-button" disabled={!!record?.replenishmentRecommendationId || lines.length >= 100} onClick={() => setLines([...lines, newLine()])}>{o.addItem}</button><p className="field-hint">{o.estimated}</p>
    </fieldset><div className="admin-form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{a.cancel}</button><button className="primary-button" disabled={busy || !products?.length}>{busy ? a.saving : a.save}</button></div></form></div>
  </AdminDialog>;
}
