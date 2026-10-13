export const formatMoney = (value: string | number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 2 }).format(Number(value));
export const formatQuantity = (value: string | number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(Number(value));
export const formatTimestamp = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
export const formatMonth = (value: string) => new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
export const unitLabel = (unit: { code: string; name?: string; symbol?: string | null } | null | undefined) => unit?.symbol || unit?.name || unit?.code || 'đơn vị';

export type DisplayUnit = { code: string; name?: string; symbol: string | null; allowFraction?: boolean };
// Estimates are rounded only for reading. Transactions and approved quantities keep their precision.
export function formatEstimate(value: string | number, unit?: DisplayUnit | null) {
  const amount = Number(value);
  const digits = unit?.allowFraction === false ? 0 : 1;
  const minimum = 10 ** -digits;
  if (amount > 0 && amount < minimum / 2) return `< ${formatQuantity(minimum)}`;
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(amount);
}
export function formatEstimatedMoney(value: string | number) {
  const amount = Number(value);
  if (amount > 0 && amount < 500) return `< ${formatMoney(1000)}`;
  return formatMoney(Math.round(amount / 1000) * 1000);
}
export function periodDays(start: string, end: string) {
  return Math.max(1, Math.round((Date.parse(end.slice(0, 10)) - Date.parse(start.slice(0, 10))) / 86400000) + 1);
}
