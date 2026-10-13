"use client";
import { useEffect, useState } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { useAuth } from "@/components/auth-provider";
import { catalogError } from "@/components/product-form";
import { apiRequest } from "@/lib/api";
import type { InventoryRow, LotPage } from "@/lib/catalog";
import { vi } from "@/i18n/vi";
const c = vi.catalog; const a = vi.admin; const i = vi.inventory;
export function InventoryLotsDialog({ row, onClose }: { row: Pick<InventoryRow, 'locationId' | 'productId' | 'sku' | 'productName' | 'locationName'>; onClose: () => void }) {
  const { user } = useAuth(); const costs = user?.role !== "STAFF";
  const [data, setData] = useState<LotPage | null>(null); const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    apiRequest<LotPage>(`/inventory/${row.locationId}/${row.productId}/lots`, { signal: abort.signal }).then((r) => { if (!abort.signal.aborted) setData(r); }).catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [row.locationId, row.productId, revision]);
  return <AdminDialog titleId="lots-title" onClose={onClose}><h2 id="lots-title">{i.lotTitle}</h2><p className="admin-dialog-description">{row.sku} · {row.productName} · {row.locationName}</p>
    {error && <div role="alert" className="form-error">{error} <button className="text-button" onClick={() => { setError(""); setRevision(revision + 1); }}>{a.retry}</button></div>}
    {!data && !error && <p role="status">{c.loading}</p>}
    {data && <><p className="field-hint">{i.ordering[data.ordering]}</p>{data.items.length === 0 ? <p>{i.noLots}</p> : <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={i.lotTitle}><table className="admin-table"><thead><tr><th>{i.lotNumber}</th><th>{i.quantity}</th>{costs && <th>{i.unitCost}</th>}<th>{i.received}</th><th>{i.expiryDate}</th><th>{a.status}</th></tr></thead><tbody>{data.items.map((lot) => <tr key={lot.id}><th scope="row">{lot.lotNumber ?? a.noValue}</th><td>{lot.quantityOnHand}</td>{costs && <td>{lot.unitCost ?? a.noValue}</td>}<td>{lot.receivedDate}</td><td>{lot.expiryDate ?? a.noValue}</td><td><span className={`expiry-status expiry-${lot.expiryStatus.toLowerCase()}`}>{i.statuses[lot.expiryStatus]}</span></td></tr>)}</tbody></table></div>}</>}
    <div className="admin-form-actions"><button className="secondary-button" onClick={onClose}>{c.close}</button></div>
  </AdminDialog>;
}
