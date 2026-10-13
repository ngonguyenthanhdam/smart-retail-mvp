"use client";
import { useState } from "react";
import { OperationList } from "@/components/operation-list";
import { AdminDialog } from "@/components/admin-dialog";
import { PurchaseForm } from "@/components/purchase-form";
import { catalogError } from "@/components/product-form";
import { apiRequest } from "@/lib/api";
import { saveRecord } from "@/lib/catalog";
import { displayDate, type Purchase, type PurchaseDetail } from "@/lib/operations";
import { vi, importCopy, decisionCopy } from "@/i18n/vi";
const o = vi.operations; const a = vi.admin;
export function PurchasesPage() {
  const [revision, setRevision] = useState(0); const [detail, setDetail] = useState<PurchaseDetail | null>(null); const [editing, setEditing] = useState<PurchaseDetail | "new" | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [success, setSuccess] = useState(false); const [confirm, setConfirm] = useState<"cancel" | "receive" | null>(null);
  async function open(id: string) { setBusy(true); setError(""); setSuccess(false); try { setDetail(await apiRequest<PurchaseDetail>(`/purchases/${id}`)); } catch (e) { setError(catalogError(e)); } finally { setBusy(false); } }
  function saved() { setEditing(null); setDetail(null); setSuccess(true); setRevision(revision + 1); }
  async function transition() { if (!detail || !confirm) return; setBusy(true); setError(""); try { setDetail(await saveRecord<PurchaseDetail>(`/purchases/${detail.id}/${confirm}`, {})); setConfirm(null); setRevision(revision + 1); } catch (e) { setError(catalogError(e)); } finally { setBusy(false); } }
  return <div className="page-content">{!detail && error && <p className="form-error" role="alert">{error}</p>}{success && <p className="form-success" role="status">{o.saved}</p>}
    <OperationList<Purchase> path="/purchases" title={o.purchases} description={o.purchaseDescription} createLabel={o.newPurchase} onCreate={() => { setError(""); setSuccess(false); setEditing("new"); }} revision={revision} statuses={["DRAFT", "RECEIVED", "CANCELLED"]} columns={[o.orderNumber, o.location, o.orderedAt, a.status, o.totalCost, a.actions]} row={(p) => <><th scope="row" className="operation-number">{p.orderNumber}</th><td>{p.location?.name ?? a.noValue}</td><td>{displayDate(p.orderedAt)}</td><td><span className={`record-status ${p.status === "RECEIVED" ? "is-active" : "is-inactive"}`}>{o.status[p.status]}</span></td><td>{p.totalCost}</td><td><button className="text-button" disabled={busy} onClick={() => void open(p.id)}>{o.view}</button></td></>} />
    {editing && <PurchaseForm record={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={saved} />}
    {detail && !editing && <AdminDialog titleId="purchase-detail-title" busy={busy} onClose={() => { setDetail(null); setConfirm(null); setError(""); }}><div className="operation-dialog"><h2 id="purchase-detail-title">{o.purchaseDetail}</h2><p className="operation-number">{detail.orderNumber}</p><p>{detail.location?.name} · {o.status[detail.status]}</p><p>{o.orderedAt}: {displayDate(detail.orderedAt)} · {o.receivedAt}: {displayDate(detail.receivedAt)}</p><p>{o.createdBy}: {detail.creator?.fullName ?? a.noValue}</p>{detail.note && <p>{detail.note}</p>}
      <p>{detail.importJobId ? importCopy.origin.historical : importCopy.origin.live}</p>
      {detail.replenishmentRecommendationId && <p>{decisionCopy.linkedDraft}</p>}{error && <p className="form-error" role="alert">{error}</p>}
      <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={o.items}><table className="admin-table"><thead><tr>{[vi.catalog.product, o.purchaseQuantity, o.baseQuantity, o.purchaseCost, vi.inventory.lotNumber, vi.inventory.expiryDate, o.lineTotal].map((s) => <th key={s}>{s}</th>)}</tr></thead><tbody>{detail.items.map((i) => <tr key={i.id}><th scope="row">{i.product?.name}<span className="admin-cell-note">{i.product?.sku}</span></th><td>{i.purchaseQuantity} {i.product?.purchaseUnit?.code}</td><td>{i.baseQuantity} {i.product?.baseUnit?.code}</td><td>{i.unitCost}</td><td>{i.lotNumber ?? a.noValue}</td><td>{displayDate(i.expiryDate)}</td><td>{i.lineTotal}</td></tr>)}</tbody></table></div><p><strong>{o.totalCost}: {detail.totalCost}</strong></p>
      {confirm && <p>{confirm === "receive" ? o.receivePrompt : o.cancelPrompt}</p>}<div className="admin-form-actions"><button className="secondary-button" disabled={busy} onClick={() => { if (confirm) setConfirm(null); else { setDetail(null); setError(""); } }}>{confirm ? a.back : vi.catalog.close}</button>{detail.status === "DRAFT" && (confirm ? <button className={confirm === "receive" ? "primary-button" : "danger-button"} disabled={busy} onClick={() => void transition()}>{o.confirm}</button> : <><button className="text-button" disabled={busy} onClick={() => setConfirm("cancel")}>{o.cancelPurchase}</button><button className="secondary-button" disabled={busy} onClick={() => setEditing(detail)}>{a.edit}</button><button className="primary-button" disabled={busy} onClick={() => setConfirm("receive")}>{o.receive}</button></>)}</div>
    </div></AdminDialog>}
  </div>;
}
