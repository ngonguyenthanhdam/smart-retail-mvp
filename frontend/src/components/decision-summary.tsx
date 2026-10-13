import type { LucideIcon } from 'lucide-react';
import { planningCopy as p } from '@/i18n/planning';
export function DecisionSummary({ counts, items }: { counts?: Record<string, number>; items: { key: string; label: string; icon: LucideIcon; tone: string }[] }) {
  return <div className="decision-summary"><div>{items.map(({ key, label, icon: Icon, tone }) => <article key={key} className={`decision-summary-item tone-${tone}`}><span><Icon size={21} /></span><div><strong>{counts ? counts[key] ?? 0 : '—'}</strong><p>{label}</p></div></article>)}</div><p>{p.summaryScope}</p></div>;
}
