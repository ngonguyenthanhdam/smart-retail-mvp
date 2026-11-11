import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { StatusTone } from '@/lib/presentation-status';
import styles from './summary.module.css';

/** Presentation only: callers supply the existing formatted value and status. */
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  badge,
  muted = false,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  icon: LucideIcon;
  tone?: StatusTone;
  badge?: ReactNode;
  muted?: boolean;
}) {
  return (
    <section className={`${styles.metricCard}${muted ? ` ${styles.mutedCard}` : ''}`}>
      <div className={styles.metricHeading}>
        <span className={styles.iconTile}>
          <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <h2>{label}</h2>
      </div>
      <p className={styles.metricValue} data-status-tone={tone}>
        {value}
      </p>
      <div className={styles.metricFoot}>
        <span>{hint}</span>
        {badge}
      </div>
    </section>
  );
}
