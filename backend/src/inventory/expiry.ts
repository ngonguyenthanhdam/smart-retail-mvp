export function businessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function expiryStatus(trackExpiry: boolean | null, expiry: string | null, today: string, warningDays: number) {
  if (!trackExpiry) return 'NOT_TRACKED';
  if (!expiry) return 'NO_EXPIRY';
  if (expiry < today) return 'EXPIRED';
  return expiry <= addDays(today, warningDays) ? 'EXPIRING_SOON' : 'NORMAL';
}
