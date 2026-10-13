import { Prisma } from '../../generated/prisma/client';
import { addDays } from '../inventory/expiry';
export type SavedDailySeries = { locationId: string; productId: string; dataSource: string; daily: { date: string; quantity: number }[] };
export function calendarMonths(origin: string, count: number) {
  const date = new Date(origin);
  return Array.from({ length: count }, (_, i) => ({
    start: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + i + 1, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + i + 2, 0)).toISOString().slice(0, 10),
  }));
}
export function predictionDays(origin: string, count: number) {
  const periods = calendarMonths(origin, count);
  return Math.max(30, Math.round((new Date(periods[periods.length - 1]!.end).getTime() - new Date(origin).getTime()) / 86400000));
}
export function savedSeries(value: Prisma.JsonValue | null): SavedDailySeries[] {
  return Array.isArray(value) ? value as unknown as SavedDailySeries[] : [];
}
export function demandWindow(value: Prisma.JsonValue | null, locationId: string, productId: string, start: string, days: number) {
  const series = savedSeries(value).find(s => s.locationId === locationId && s.productId === productId);
  if (!series || !Array.isArray(series.daily)) return null;
  const points = new Map(series.daily.map(p => [p.date, p.quantity]));
  let quantity = new Prisma.Decimal(0);
  for (let i = 0; i < days; i++) {
    const value = points.get(addDays(start, i));
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    quantity = quantity.add(String(value));
  }
  return { quantity: quantity.toDecimalPlaces(4), start, end: addDays(start, days - 1), dataSource: series.dataSource };
}
