"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, ClipboardCheck, ClipboardList, FileCheck2, Pencil, RefreshCw, X } from 'lucide-react';
import { RecommendationOverview } from './recommendation-overview';
import { DecisionSummary } from './decision-summary';
import { AdminDialog } from './admin-dialog';
import { DecisionList, useDecisionList } from './decision-list';
import { catalogError } from './product-form';
import { apiRequest } from '@/lib/api';
import { saveRecord } from '@/lib/catalog';
import type { ForecastRun } from '@/lib/forecasts';
import { quantity, type Recommendation, type DecisionStatus } from '@/lib/decision';
import { displayDate } from '@/lib/operations';
import { vi, decisionCopy as c } from '@/i18n/vi';
import { planningCopy as p } from '@/i18n/planning';
import { formatTimestamp, unitLabel } from '@/lib/format';

export function ReplenishmentPage() {
  const params = useSearchParams();
  return <ReplenishmentContent key={params.toString()} location={params.get('locationId') ?? ''} search={params.get('search') ?? ''} />;
}
function ReplenishmentContent({ location, search }: { location: string; search: string }) {
  const state = useDecisionList<Recommendation>('/replenishment', 'all', { locationId: location, search });
  const [runs,setRuns] = useState<ForecastRun[]>([]); const [runId,setRunId] = useState('');
  const [detail,setDetail] = useState<Recommendation | null>(null); const [choice,setChoice] = useState<DecisionStatus | null>(null);
  const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [success,setSuccess] = useState(''); const [purchaseConfirm,setPurchaseConfirm] = useState(false);
  const locationId = state.query.locationId;
  useEffect(() => {
    const abort = new AbortController();
    apiRequest<{ items: ForecastRun[] }>(`/forecasts/runs${locationId ? `?locationId=${locationId}` : ''}`,{ signal: abort.signal }).then(value => {
      if (!abort.signal.aborted) { setRuns(value.items.filter(r => r.status === 'COMPLETED' && r.periodKind === 'CALENDAR_MONTH')); setRunId(''); }
    }).catch(e => { if (!abort.signal.aborted) setError(catalogError(e)); });
    return () => abort.abort();
  },[locationId,state.user?.locationId]);
  async function generate() {
    if (!runId || busy) return; setBusy(true); setError(''); setSuccess('');
    try { const r = await saveRecord<{ created: number; reused: number; skipped: number }>('/replenishment/generate',{ forecastRunId: runId, ...(locationId ? { locationId } : {}) }); setSuccess(c.generated(r.created,r.reused,r.skipped)); state.refresh(); }
    catch (e) { setError(catalogError(e)); } finally { setBusy(false); }
  }
  async function open(id: string, decision: DecisionStatus | null = null) {
    setBusy(true); setError(''); setSuccess(''); setChoice(null); setPurchaseConfirm(false);
    try { const record = await apiRequest<Recommendation>(`/replenishment/${id}`); setDetail(record); setChoice(record.decisionStatus === 'PENDING' ? decision : null); } catch(e) { setError(catalogError(e)); } finally { setBusy(false); }
  }
  async function decide(form: FormData) {
    if (!detail || !choice || busy) return; setBusy(true); setError('');
    try { setDetail(await saveRecord<Recommendation>(`/replenishment/${detail.id}/decision`,{ decision: choice, reason: String(form.get('reason') ?? ''), ...(choice === 'ADJUSTED' ? { managerQuantity: String(form.get('quantity')) } : {}) })); setChoice(null); setSuccess(c.decided); state.refresh(); }
    catch(e) { setError(`${catalogError(e)} ${c.uncertainty}`); } finally { setBusy(false); }
  }
  async function purchase(form: FormData) {
    if (!detail || busy) return; setBusy(true); setError('');
    try { await saveRecord(`/replenishment/${detail.id}/purchase`,{ unitCost: String(form.get('cost')) }); setDetail(await apiRequest<Recommendation>(`/replenishment/${detail.id}`)); setSuccess(c.purchaseSaved); setPurchaseConfirm(false); state.refresh(); }
    catch(e) { setError(`${catalogError(e)} ${c.uncertainty}`); } finally { setBusy(false); }
  }
  return <div className="page-content decision-page">
    <div className="page-heading"><div><h1>{c.title}</h1><p className="page-description">{c.description}</p></div><button className="secondary-button" disabled={busy} onClick={() => { state.refresh(); if (detail) void open(detail.id); }}><RefreshCw size={16} />{c.refresh}</button></div>
    <aside className="forecast-notice"><strong>{c.demo}</strong><p>{c.demoNotice}</p></aside><p className="decision-flow">{c.flow}</p>
    {!detail && error && <p className="form-error" role="alert">{error}</p>}{!detail && success && <p className="form-success" role="status">{success}</p>}
    <DecisionSummary counts={state.data?.summary} items={[{ key: 'pending', label: p.needReview, icon: ClipboardList, tone: 'amber' }, { key: 'approved', label: p.approved, icon: ClipboardCheck, tone: 'green' }, { key: 'linked', label: p.linked, icon: FileCheck2, tone: 'blue' }, { key: 'rejected', label: p.rejected, icon: X, tone: 'neutral' }]} />
    <section className="admin-card"><div className="admin-filters"><div className="form-field"><label htmlFor="recommendation-run">{c.forecast}</label><select id="recommendation-run" disabled={busy} value={runId} onChange={e => setRunId(e.target.value)}><option value="">{c.chooseForecast}</option>{runs.map(r => <option key={r.id} value={r.id}>{formatTimestamp(r.startedAt)} · {r.horizonMonths} {p.month}</option>)}</select></div><button className="primary-button" disabled={!runId || busy} onClick={generate}><ClipboardList size={17} />{c.generate}</button></div>{!runs.length && <p className="decision-hint">{c.noForecast} <Link href="/forecasts">{vi.sections.forecasts.label}</Link></p>}</section>
    <DecisionList state={state} busy={busy} statuses={['PENDING','ACCEPTED','ADJUSTED','REJECTED']} card={r => <article className="planning-card">
      <RecommendationOverview record={r} />
      <p className="planning-caption">{p.snapshot}. {p.estimateHint} {p.draftHint}</p>
      {r.purchaseOrder && <p className="planning-linked"><FileCheck2 size={16} />{r.purchaseOrder.orderNumber} · {p.purchaseStatuses[r.purchaseOrder.status] ?? r.purchaseOrder.status}</p>}
      <div className="planning-actions">{r.decisionStatus === 'PENDING' ? <><button className="primary-button" disabled={busy} onClick={() => void open(r.id, 'ACCEPTED')}><Check size={16} />{c.accept}</button><button className="secondary-button" disabled={busy} onClick={() => void open(r.id, 'ADJUSTED')}><Pencil size={15} />{c.adjust}</button><button className="text-button planning-reject" disabled={busy} onClick={() => void open(r.id, 'REJECTED')}><X size={15} />{c.reject}</button></> : <button className="secondary-button" disabled={busy} onClick={() => void open(r.id)}>{!r.purchaseOrder && ['ACCEPTED','ADJUSTED'].includes(r.decisionStatus) && Number(r.expectedPurchaseQuantity) > 0 ? c.purchase : c.view}</button>}</div>
    </article>} />
    {detail && <AdminDialog titleId="recommendation-title" busy={busy} onClose={() => setDetail(null)}><div className="operation-dialog decision-detail">
      <h2 id="recommendation-title">{c.detail}</h2><RecommendationOverview record={detail} />
      <p className="page-description">{p.reviewHint} {c.snapshot}</p><details className="planning-calculation"><summary>{p.details}</summary><dl className="decision-values">{[
        [c.demand,quantity(detail.demandQuantitySnapshot ?? detail.forecast.predictedQuantity)],[c.current,quantity(detail.currentStockSnapshot)],[c.incoming,quantity(detail.incomingStockSnapshot)],[c.safety,quantity(detail.safetyStockSnapshot)],
        [c.recommended,quantity(detail.recommendedQuantity)],[c.unit,detail.product.baseUnit?.symbol ?? detail.product.baseUnit?.code],[c.approved,quantity(detail.decisionStatus === 'ADJUSTED' ? detail.managerQuantity : detail.decisionStatus === 'ACCEPTED' ? detail.recommendedQuantity : null)],
        [c.purchaseUnit,detail.product.purchaseUnit?.symbol ?? detail.product.purchaseUnit?.code],[c.ratio,quantity(detail.product.purchaseToBaseRatio)],[c.expected,quantity(detail.expectedPurchaseQuantity)],[c.represented,quantity(detail.expectedBaseQuantity)],
        [c.model,detail.forecast.run.modelVersion],[c.forecastDate,displayDate(detail.forecast.createdAt)],[c.period,`${displayDate(detail.demandPeriodStart ?? detail.forecast.periodStart)} — ${displayDate(detail.demandPeriodEnd ?? detail.forecast.periodEnd)}`],
      ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl><p className="page-description">{c.rounding}</p></details>
      {error && <p className="form-error" role="alert">{error}</p>}{success && <p className="form-success" role="status">{success}</p>}
      {detail.decisionStatus === 'PENDING' && <><div className="admin-form-actions">{(['ACCEPTED','ADJUSTED','REJECTED'] as const).map((value,i) => <button key={value} className={i === 2 ? 'danger-button' : 'secondary-button'} disabled={busy} aria-pressed={choice === value} onClick={() => setChoice(value)}>{[c.accept,c.adjust,c.reject][i]}</button>)}</div>
        {choice && <form onSubmit={e => { e.preventDefault(); void decide(new FormData(e.currentTarget)); }}><p>{c.decisionPrompt}</p>{choice === 'ADJUSTED' && <div className="form-field"><label htmlFor="adjust-quantity">{c.adjusted} ({unitLabel(detail.product.baseUnit)})</label><input id="adjust-quantity" name="quantity" type="number" min="0" step={detail.product.baseUnit?.allowFraction === false ? '1' : '0.0001'} required defaultValue={detail.recommendedQuantity} disabled={busy} /></div>}
          <div className="form-field"><label htmlFor="decision-reason">{choice === 'ADJUSTED' ? c.requiredReason : c.reason}</label><textarea id="decision-reason" name="reason" required={choice === 'ADJUSTED'} maxLength={4000} disabled={busy} /></div><button className="primary-button" disabled={busy}>{c.save}</button></form>}
      </>}
      {detail.purchaseOrder ? <div className="decision-linked"><strong>{c.linked}</strong><p className="operation-number">{detail.purchaseOrder.orderNumber} · {p.purchaseStatuses[detail.purchaseOrder.status] ?? detail.purchaseOrder.status}</p><Link className="secondary-button" href="/purchases">{c.openPurchases}</Link></div> : ['ACCEPTED','ADJUSTED'].includes(detail.decisionStatus) && (Number(detail.expectedPurchaseQuantity) > 0 ? <>
        <p className="planning-purchase-preview">{c.expected}: <strong>{quantity(detail.expectedPurchaseQuantity)} {unitLabel(detail.product.purchaseUnit)}</strong> = {quantity(detail.expectedBaseQuantity)} {unitLabel(detail.product.baseUnit)}. {c.rounding}</p>
        {!purchaseConfirm ? <button className="primary-button" disabled={busy} onClick={() => setPurchaseConfirm(true)}>{c.purchase}</button> : <form onSubmit={e => { e.preventDefault(); void purchase(new FormData(e.currentTarget)); }}><p>{c.purchasePrompt}</p><div className="form-field"><label htmlFor="purchase-cost">{c.cost}</label><input id="purchase-cost" name="cost" type="number" min="0" step="0.01" required disabled={busy} /></div><p className="page-description">{c.costHint}</p><button className="primary-button" disabled={busy}>{c.purchase}</button></form>}
      </> : <p>{c.zero}</p>)}
      <div className="admin-form-actions"><button className="secondary-button" disabled={busy} onClick={() => setDetail(null)}>{vi.catalog.close}</button></div>
    </div></AdminDialog>}
  </div>;
}
