import type { LucideIcon } from 'lucide-react';
import { planningCopy as p } from '@/i18n/planning';
import { formatQuantity } from '@/lib/format';
export function DecisionSummary({ counts, items }: { counts?: Record<string, number>; items: { key: string; label: string; icon: LucideIcon; tone: string }[] }) {
  return <div className="decision-summary"><div>{items.map(({ key, label, icon: Icon, tone }) => {
    const count = counts?.[key];
    const semantic = !count ? 'neutral' : tone === 'red' ? 'danger' : tone === 'amber' ? 'warning' : tone === 'green' ? 'success' : 'neutral';
    return <article key={key} className={`decision-summary-item semantic-${semantic}`}><span><Icon size={21} aria-hidden="true" /></span><div><strong data-status-tone={semantic}>{count === undefined ? '—' : formatQuantity(count)}</strong><p>{label}</p></div></article>;
  })}</div><p>{p.summaryScope}</p></div>;
}
