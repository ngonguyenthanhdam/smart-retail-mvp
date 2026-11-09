import { periodDays, type NumericValue } from './format';

const absent = '—';
const whole = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
  signDisplay: 'negative',
});
const daily = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 1,
  signDisplay: 'negative',
});

/** Reject missing/malformed data before Intl can coerce it to zero. */
export function isForecastValue(
  value: unknown,
): value is number | bigint | Intl.StringNumericLiteral {
  if (typeof value === 'bigint') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return (
    typeof value === 'string' &&
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) &&
    Number.isFinite(Number(value))
  );
}

function display(value: NumericValue, formatter: Intl.NumberFormat): string {
  // Intl accepts Decimal strings directly, preserving precision before display rounding.
  return isForecastValue(value) ? formatter.format(value) : absent;
}

/** Presentation only: never use these strings as inputs to calculations or requests. */
export const formatForecastMonthlyQuantity = (value: NumericValue) => display(value, whole);
export const formatForecastDailyQuantity = (value: NumericValue) => display(value, daily);
export function formatForecastMoney(value: NumericValue): string {
  const formatted = display(value, whole);
  return formatted === absent ? absent : `${formatted} VND`;
}

export function formatForecastDailyAverage(
  quantity: NumericValue,
  start: string,
  end: string,
): string {
  if (!isForecastValue(quantity)) return absent;
  const days = periodDays(start, end);
  if (!Number.isFinite(days) || Date.parse(end) < Date.parse(start)) return absent;
  // Keep the existing monthly quantity / calendar-day calculation; round only its label.
  return formatForecastDailyQuantity(Number(quantity) / days);
}

export function formatForecastRevenueTotal(values: readonly NumericValue[]): string {
  if (!values.every(isForecastValue)) return absent;
  // Sum original values first. Missing revenue must not become a misleading partial total.
  return formatForecastMoney(values.reduce<number>((sum, value) => sum + Number(value), 0));
}
