"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { useAuth } from "@/components/auth-provider";
import { catalogError } from "@/components/product-form";
import { allOptions, saveRecord } from "@/lib/catalog";
import type { Location } from "@/lib/locations";
import { localDate, type Expense } from "@/lib/operations";
import { vi } from "@/i18n/vi";
const o = vi.operations; const a = vi.admin;
export function ExpenseForm({ record, onClose, onSaved }: { record?: Expense; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth(); const admin = user?.role === "ADMIN";
  const [locations, setLocations] = useState<Location[] | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!admin) return;
    const abort = new AbortController();
    allOptions<Location>("/locations?status=active", abort.signal).then((rows) => { if (!abort.signal.aborted) setLocations(rows); }).catch((e) => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  }, [admin, revision]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget); const v = (key: string) => String(f.get(key) ?? ""); setBusy(true); setError("");
    try { await saveRecord("/expenses", { locationId: admin ? v("locationId") || null : user?.locationId, expenseType: v("expenseType"), amount: v("amount"), expenseDate: v("expenseDate"), description: v("description") }, record?.id); onSaved(); }
    catch (e) { setError(catalogError(e)); setBusy(false); }
  }
  return <AdminDialog titleId="expense-form-title" busy={busy} onClose={onClose}><h2 id="expense-form-title">{record ? o.editExpense : o.newExpense}</h2>
    {error && <p className="form-error" role="alert">{error} {admin && !locations && <button className="text-button" onClick={() => { setError(""); setRevision(revision + 1); }}>{a.retry}</button>}</p>}
    {admin && !locations && !error && <p role="status">{vi.catalog.loading}</p>}
    <form className="admin-form" onSubmit={submit}><fieldset className="admin-fieldset" disabled={busy || (admin && !locations)}><div className="admin-form-grid">
      {admin ? <div className="form-field admin-span-full"><label htmlFor="expense-location">{o.location}</label><select id="expense-location" name="locationId" defaultValue={record?.locationId ?? ""}><option value="">{o.company}</option>{record?.location && !locations?.some((l) => l.id === record.locationId) && <option value={record.locationId!}>{record.location.name}</option>}{locations?.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</select></div> : <p>{user?.location?.name}</p>}
      <div className="form-field"><label htmlFor="expense-type">{o.expenseType}</label><select id="expense-type" name="expenseType" defaultValue={record?.expenseType ?? "OTHER"}>{Object.entries(o.expenseTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="form-field"><label htmlFor="expense-amount">{o.amount}</label><input id="expense-amount" name="amount" type="number" required min="0" max="999999999999.99" step="0.01" defaultValue={record?.amount ?? ""} /></div>
      <div className="form-field"><label htmlFor="expense-date">{o.expenseDate}</label><input id="expense-date" name="expenseDate" type="date" required defaultValue={record?.expenseDate.slice(0, 10) ?? localDate()} /></div>
      <div className="form-field admin-span-full"><label htmlFor="expense-description">{o.description}</label><textarea id="expense-description" name="description" maxLength={4000} defaultValue={record?.description ?? ""} /></div>
    </div></fieldset>{record && <p>{o.createdBy}: {record.creator?.fullName ?? a.noValue}</p>}<div className="admin-form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{a.cancel}</button><button className="primary-button" disabled={busy || (admin && !locations)}>{busy ? a.saving : a.save}</button></div></form>
  </AdminDialog>;
}
