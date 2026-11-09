import { formatQuantity, type NumericValue } from './format';
import {
  formatForecastDailyQuantity,
  formatForecastMonthlyQuantity,
  isForecastValue,
} from './forecast-format';

/** Compact labels only. Decisions, conversions and forms must retain the original values. */
export function formatPlanningQuantity(
  value: NumericValue,
  decimals: 0 | 1 = 0,
  estimated = false,
): string {
  if (!isForecastValue(value)) return '—';
  const rounded =
    decimals === 0 ? formatForecastMonthlyQuantity(value) : formatForecastDailyQuantity(value);
  // A small nonzero quantity must not look like no stock or no purchase needed.
  if (rounded === '0' && Number(value) !== 0) {
    const threshold = decimals === 0 ? '1' : '0,1';
    return Number(value) > 0 ? `< ${threshold}` : `> -${threshold}`;
  }
  return estimated || rounded !== formatQuantity(value) ? `≈ ${rounded}` : rounded;
}
