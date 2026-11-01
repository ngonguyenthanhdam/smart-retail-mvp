import { addDays, businessDate } from '../inventory/expiry';

export function summaryQuery(message: string, today = businessDate()) {
  const text = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
    .replace(/[?.!]+$/, '')
    .replace(/\s+/g, ' ');
  const match = text.match(
    /^(?:cho toi biet )?(?:tong )?(doanh thu(?: ban hang)?|gia von|loi nhuan gop|chi phi) (.+?)(?: la bao nhieu| bao nhieu)?$/,
  );
  if (!match) return null;
  const when = match[2]!;
  let from: string;
  let to: string;
  const range = when.match(/^tu(?: ngay)? (\d{4}-\d{2}-\d{2}) den(?: ngay)? (\d{4}-\d{2}-\d{2})$/);
  const day = when.match(/^(?:ngay )?(\d{4}-\d{2}-\d{2})$/);
  if (range) {
    from = range[1]!;
    to = range[2]!;
  } else if (day) from = to = day[1]!;
  else if (when === 'hom nay') from = to = today;
  else if (when === 'hom qua') from = to = addDays(today, -1);
  else return null;
  return {
    name: match[1] === 'chi phi' ? 'getExpenseSummary' : 'getSalesSummary',
    arguments: { from, to },
  };
}
