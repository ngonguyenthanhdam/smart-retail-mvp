import type { Locale } from '@/i18n/types';

export type NumericValue = string | number | bigint | null | undefined;
const absent = '—';
/** Preserve API Decimal strings without a lossy conversion to Number. */
export function formatQuantity(value: NumericValue): string {
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'number' && !Number.isFinite(value))
  )
    return absent;
  if (!['string', 'number', 'bigint'].includes(typeof value)) return absent;
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value).trim());
  if (!match) return absent;
  const [, sign, whole, fraction = '', exponent = '0'] = match;
  const shift = Number(exponent);
  if (
    !Number.isSafeInteger(shift) ||
    Math.abs(shift) > 1000 ||
    whole.length + fraction.length > 10000
  )
    return absent;
  const digits = whole + fraction;
  const point = whole.length + shift;
  const integer = (point <= 0 ? '0' : digits.slice(0, point).padEnd(point, '0')).replace(
    /^0+(?=\d)/,
    '',
  );
  const decimal = (point < 0 ? '0'.repeat(-point) + digits : digits.slice(point)).replace(
    /0+$/,
    '',
  );
  const negative = sign === '-' && /[1-9]/.test(integer + decimal) ? '-' : '';
  return negative + integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (decimal ? `,${decimal}` : '');
}
export function formatVND(value: NumericValue): string {
  const formatted = formatQuantity(value);
  return formatted === absent ? absent : `${formatted} VND`;
}
export const formatMoney = formatVND;
export const formatTimestamp = (value: string, locale: Locale = 'vi') =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
export const formatMonth = (value: string, locale: Locale = 'vi') =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
export function formatUnit(
  unit: DisplayUnit | string | null | undefined,
  locale: Locale = 'vi',
): string {
  const code = typeof unit === 'string' ? unit : unit?.code;
  const symbol = typeof unit === 'object' ? unit?.symbol : undefined;
  const standard: Record<string, string> = {
    KG: 'kg',
    G: 'g',
    GRAM: 'g',
    KILOGRAM: 'kg',
    ML: 'ml',
    L: 'l',
  };
  if (typeof code === 'string' && standard[code.trim().toUpperCase()])
    return standard[code.trim().toUpperCase()];
  if (typeof symbol === 'string' && standard[symbol.trim().toUpperCase()])
    return standard[symbol.trim().toUpperCase()];
  const label = typeof unit === 'string' ? unit : unit?.symbol || unit?.name || unit?.code;
  return (
    (typeof label === 'string' && label.trim()) ||
    (locale === 'vi' ? 'chưa rõ đơn vị' : 'unit unspecified')
  );
}
export const unitLabel = formatUnit;
export const formatQuantityWithUnit = (
  value: NumericValue,
  unit?: DisplayUnit | string | null,
  locale: Locale = 'vi',
) => `${formatQuantity(value)} ${formatUnit(unit, locale)}`;

export type DisplayUnit = {
  code: string;
  name?: string;
  symbol?: string | null;
  allowFraction?: boolean;
};

export function formatEstimate(value: NumericValue, unit?: DisplayUnit | null) {
  void unit;
  return formatQuantity(value);
}
export const formatEstimatedMoney = formatVND;
export function periodDays(start: string, end: string) {
  return Math.max(
    1,
    Math.round((Date.parse(end.slice(0, 10)) - Date.parse(start.slice(0, 10))) / 86400000) + 1,
  );
}
