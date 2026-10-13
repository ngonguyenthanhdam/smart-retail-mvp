import { CalendarDays, CircleHelp, Store } from 'lucide-react';
import { ProductImage } from './product-image';
import type { Recommendation } from '@/lib/decision';
import { formatEstimate, formatQuantity, unitLabel } from '@/lib/format';
import { displayDate } from '@/lib/operations';
import { planningCopy as p } from '@/i18n/planning';
import { decisionCopy as c } from '@/i18n/vi';

export function RecommendationOverview({ record: r }: { record: Recommendation }) {
  const unit = unitLabel(r.product.baseUnit);
  const approved = ['ACCEPTED', 'ADJUSTED'].includes(r.decisionStatus);
  const value = approved && r.decisionStatus === 'ADJUSTED' ? r.managerQuantity ?? r.recommendedQuantity : r.recommendedQuantity;
  return <>
    <div className="planning-product"><ProductImage name={r.product.name} imageKey={r.product.imageKey} /><div><small>{r.product.sku}</small><h2>{r.product.name}</h2><p><Store size={13} />{r.location.name}</p></div></div>
    <div className="planning-status-row"><span className={`planning-badge status-${r.decisionStatus.toLowerCase()}`}>{c.statuses[r.decisionStatus]}</span><small>{r.dataSource === 'SYNTHETIC' ? p.sourceSynthetic : r.dataSource === 'MIXED' ? p.sourceMixed : p.sourceStore}</small></div>
    <div className="planning-quantity"><span>{approved ? p.approvedQuantity : r.decisionStatus === 'REJECTED' ? p.originalQuantity : Number(value) > 0 ? p.suggest : p.noNeed}</span><strong>{formatQuantity(value)} <small>{unit}</small></strong></div>
    <dl className="planning-metrics"><div><dt>{p.available}</dt><dd>{formatQuantity(r.currentStockSnapshot)} <small>{unit}</small></dd></div><div><dt>{p.demand}</dt><dd>≈ {formatEstimate(r.demandQuantitySnapshot ?? r.forecast.predictedQuantity, r.product.baseUnit)} <small>{unit}</small></dd></div><div><dt>{p.reserve}</dt><dd>{formatQuantity(r.safetyStockSnapshot)} <small>{unit}</small></dd></div></dl>
    <div className="planning-reason"><CircleHelp size={17} /><div><strong>{p.why}</strong><p>{Number(r.recommendedQuantity) > 0 ? p.shortageReason : p.enoughReason}</p>{Number(r.incomingStockSnapshot) > 0 && <p>{p.incoming}: {formatQuantity(r.incomingStockSnapshot)} {unit}.</p>}</div></div>
    <p className="planning-period"><CalendarDays size={14} />{displayDate(r.demandPeriodStart ?? r.forecast.periodStart)} – {displayDate(r.demandPeriodEnd ?? r.forecast.periodEnd)}</p>
    {r.decisionNote && <p className="planning-caption"><strong>{c.reason}:</strong> {r.decisionNote}</p>}
  </>;
}
