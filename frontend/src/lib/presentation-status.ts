/** Presentation only: use recorded states, never infer performance targets. */
export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export function profitTone(value: string | number): StatusTone {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return 'neutral';
  return amount < 0 ? 'danger' : 'success';
}

export function stockTone(quantity: string | number, lowStock: boolean, hasThreshold = true): StatusTone {
  const amount = Number(quantity);
  if (!Number.isFinite(amount)) return 'neutral';
  if (amount <= 0) return 'danger';
  return lowStock ? 'warning' : hasThreshold ? 'success' : 'neutral';
}

export function expiryTone(status: string): StatusTone {
  if (status === 'EXPIRED') return 'danger';
  if (status === 'EXPIRING_SOON') return 'warning';
  if (status === 'NORMAL') return 'success';
  return 'neutral';
}

export function operationTone(status: string): StatusTone {
  if (status === 'COMPLETED' || status === 'RECEIVED') return 'success';
  if (status === 'DRAFT') return 'warning';
  return 'neutral';
}
