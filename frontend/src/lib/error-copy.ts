import { vi, en } from '@/i18n/messages/errors';
import type { Locale } from '@/i18n/types';

/** Only structured codes/statuses are localized. Unknown server text is preserved. */
export function translateMessage(
  message: string,
  status = 400,
  code?: string,
  locale: Locale = 'vi',
): string {
  const copy = locale === 'en' ? en : vi;
  if (code && Object.hasOwn(copy.codes, code)) return copy.codes[code as keyof typeof copy.codes];
  if (message) return message;
  const key = status >= 500 ? '500' : String(status);
  return copy.status[key as keyof typeof copy.status] ?? copy.status.default;
}
