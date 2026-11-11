import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './summary.module.css';

export function SectionHeading({
  id,
  title,
  description,
  icon: Icon,
  action,
}: {
  id: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className={styles.sectionHeading}>
      <span className={styles.iconTile}>
        <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className={styles.sectionCopy}>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className={styles.sectionAction}>{action}</div>}
    </div>
  );
}
