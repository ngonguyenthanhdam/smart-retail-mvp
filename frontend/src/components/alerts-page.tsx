"use client";
import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Layers3, PackageSearch, RefreshCw, ShieldAlert, Store } from 'lucide-react';
import { DecisionList, useDecisionList } from './decision-list';
import { DecisionSummary } from './decision-summary';
import { InventoryLotsDialog } from './inventory-lots-dialog';
import { ProductImage } from './product-image';
import { catalogError } from './product-form';
import { saveRecord } from '@/lib/catalog';
import type { InventoryAlert } from '@/lib/decision';
import { displayDate } from '@/lib/operations';
import { formatQuantity, formatTimestamp, unitLabel } from '@/lib/format';
import { decisionCopy as c } from '@/i18n/vi';
import { planningCopy as p } from '@/i18n/planning';
export function AlertsPage() {
  const state = useDecisionList<InventoryAlert>('/alerts','OPEN'); const [busy,setBusy] = useState(false); const [success,setSuccess] = useState('');
  const [lastCheck,setLastCheck] = useState<{ scope: string; at: string } | null>(null);
  const [lotAlert,setLotAlert] = useState<InventoryAlert | null>(null);
  async function evaluate() { if (busy) return; setBusy(true); setSuccess(''); state.setError('');
    try { const result = await saveRecord<{ evaluatedAt: string }>('/alerts/evaluate',state.query.locationId ? { locationId: state.query.locationId } : {}); setLastCheck({ scope: state.query.locationId, at: result.evaluatedAt }); state.refresh(); setSuccess(c.evaluated); }
    catch(e) { state.setError(catalogError(e)); } finally { setBusy(false); }
  }
  function card(r: InventoryAlert) {
    const expiry = r.alertType === 'EXPIRY_RISK';
    const expired = expiry && !!r.lot?.expiryDate && !!state.data?.businessDate && r.lot.expiryDate.slice(0,10) < state.data.businessDate;
    const fallback = r.alertType === 'STOCKOUT_RISK' && !r.demandForecastId;
    const overstock = r.alertType === 'OVERSTOCK_RISK';
    const resolved = r.status === 'RESOLVED';
    const title = resolved ? c.types[r.alertType] : expiry ? expired ? p.expired : p.expiring : overstock ? p.excess : fallback ? p.minimum : p.shortage;
    const action = resolved ? p.resolvedHint : expiry ? expired ? p.expiryAction : p.expiringAction : overstock ? p.excessAction : fallback ? p.minimumAction : p.shortageAction;
    const Icon = resolved ? CheckCircle2 : expiry ? Clock3 : overstock ? Layers3 : AlertTriangle;
    return <article className={`planning-card alert-card ${resolved ? 'alert-resolved' : `alert-${r.severity.toLowerCase()}`}`}>
      <div className="alert-priority"><Icon size={21} /><h2>{title}</h2><span className="planning-badge">{resolved ? p.resolved : c.severities[r.severity]}</span></div>
      <div className="planning-product"><ProductImage name={r.product.name} imageKey={r.product.imageKey} /><div><small>{r.product.sku}</small><h3>{r.product.name}</h3><p><Store size={13} />{r.location.name}</p></div></div>
      <div className="alert-reason"><p>{r.message}</p><small>{expiry ? p.lotBasis : fallback ? p.noForecast : p.forecastBasis}</small></div>
      {expiry && r.lot && <dl className="planning-metrics alert-lot-metrics"><div><dt>{p.lot}</dt><dd>{r.lot.lotNumber ?? '—'}</dd></div><div><dt>{p.expiryDate}</dt><dd>{displayDate(r.lot.expiryDate)}</dd></div><div><dt>{p.lotQuantity}</dt><dd>{formatQuantity(r.lot.quantityOnHand)} <small>{unitLabel(r.product.baseUnit)}</small></dd></div></dl>}
      <div className="alert-next"><strong><ArrowRight size={15} />{p.next}</strong><p>{action}</p></div>
      <p className="planning-caption">{p.detected}: {formatTimestamp(r.detectedAt)}{resolved && r.resolvedAt && <> · {p.resolved}: {formatTimestamp(r.resolvedAt)}</>}</p>
      <div className="planning-actions"><button className="secondary-button" disabled={busy} onClick={() => setLotAlert(r)}><PackageSearch size={16} />{p.viewLots}</button>{!resolved && !expiry && (!overstock && !fallback ? <Link className="primary-button" href={`/replenishment?${new URLSearchParams({ locationId: r.locationId, search: r.product.sku })}`}>{p.viewRecommendations}<ArrowRight size={15} /></Link> : <Link className="text-button" href="/forecasts">{p.viewForecast}<ArrowRight size={15} /></Link>)}</div>
    </article>;
  }
  return <div className="page-content decision-page"><div className="page-heading"><div><h1>{c.alertsTitle}</h1><p className="page-description">{c.alertsDescription}</p></div><button className="primary-button" disabled={busy} onClick={evaluate}><RefreshCw size={16} />{busy ? p.checking : p.check}</button></div>
    <DecisionSummary counts={state.data?.summary} items={[{ key: 'open', label: p.openAlerts, icon: ShieldAlert, tone: 'amber' }, { key: 'urgent', label: p.urgent, icon: AlertTriangle, tone: 'red' }, { key: 'expiry', label: p.expiryAlerts, icon: Clock3, tone: 'blue' }, { key: 'resolved', label: p.resolved, icon: CheckCircle2, tone: 'green' }]} />
    <div className="alert-check-info"><p><Clock3 size={15} />{lastCheck && lastCheck.scope === state.query.locationId ? `${p.latestCheck} ${formatTimestamp(lastCheck.at)}` : p.notChecked}</p><small>{p.sorted}</small></div>
    {success && <p className="form-success" role="status">{success}</p>}
    <DecisionList state={state} busy={busy} statuses={['OPEN','RESOLVED']} alertFilters card={card} />
    {lotAlert && <InventoryLotsDialog row={{ locationId: lotAlert.locationId, productId: lotAlert.productId, sku: lotAlert.product.sku, productName: lotAlert.product.name, locationName: lotAlert.location.name }} onClose={() => setLotAlert(null)} />}
  </div>;
}
