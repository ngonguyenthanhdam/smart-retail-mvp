"use client";
import { useState } from "react";
import { OperationList } from "@/components/operation-list";
import { ExpenseForm } from "@/components/expense-form";
import { displayDate, type Expense } from "@/lib/operations";
import { vi } from "@/i18n/vi";
const o = vi.operations; const a = vi.admin;
export function ExpensesPage() {
  const [editing, setEditing] = useState<Expense | "new" | null>(null); const [revision, setRevision] = useState(0); const [success, setSuccess] = useState(false);
  return <div className="page-content">{success && <p className="form-success" role="status">{o.saved}</p>}
    <OperationList<Expense> path="/expenses" title={o.expenses} description={o.expenseDescription} revision={revision} createLabel={o.newExpense} onCreate={() => { setSuccess(false); setEditing("new"); }} columns={[o.expenseDate, o.location, o.expenseType, o.amount, o.description, a.actions]} row={(r) => <><th scope="row">{displayDate(r.expenseDate)}</th><td>{r.location?.name ?? o.company}</td><td>{o.expenseTypes[r.expenseType]}</td><td>{r.amount}</td><td className="operation-description">{r.description ?? a.noValue}</td><td><button className="text-button" onClick={() => { setSuccess(false); setEditing(r); }}>{a.edit}</button></td></>} />
    {editing && <ExpenseForm record={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setSuccess(true); setRevision(revision + 1); }} />}
  </div>;
}
