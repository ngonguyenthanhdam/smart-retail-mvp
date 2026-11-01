import type { ReactNode } from 'react';
import { CircleCheck, CircleAlert, CircleMinus, TriangleAlert } from 'lucide-react';
import type { StatusTone } from '@/lib/presentation-status';

const icons = {
  neutral: CircleMinus,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const Icon = icons[tone];
  return (
    <span className={`semantic-badge semantic-${tone}`}>
      <Icon size={13} aria-hidden="true" />
      {children}
    </span>
  );
}

export function StatusValue({
  tone,
  label,
  children,
}: {
  tone: StatusTone;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className={`semantic-value semantic-${tone}`} data-status-tone={tone}>
      <strong>{children}</strong>
      <span className="semantic-caption">{label}</span>
    </span>
  );
}
