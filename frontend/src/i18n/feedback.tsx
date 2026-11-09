'use client';
import { messages } from './messages';
import { screens } from './screens';
import * as errors from './messages/errors';
import * as dynamic from './dynamic';
import { useLocale } from './provider';
import type { Locale } from './types';

const pairs = new Map<string, { vi: string; en: string }>();
function collect(vi: unknown, en: unknown) {
  if (typeof vi === 'string' && typeof en === 'string') {
    pairs.set(vi, { vi, en });
    pairs.set(en, { vi, en });
  } else if (vi && en && typeof vi === 'object' && typeof en === 'object') {
    for (const key of Object.keys(vi))
      collect((vi as Record<string, unknown>)[key], (en as Record<string, unknown>)[key]);
  }
}
collect(messages.vi, messages.en);
collect(errors.vi, errors.en);
Object.values(screens).forEach((copy) => collect(copy.vi, copy.en));
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// These patterns are generated only from our own interpolation templates, never server messages.
const templates = Object.keys(dynamic.vi).flatMap((key) => {
  const name = key as keyof typeof dynamic.vi;
  const source = dynamic.vi[name] as (...args: string[]) => string;
  const target = dynamic.en[name] as (...args: string[]) => string;
  const args = Array.from({ length: source.length }, (_, i) => `__VALUE_${i}__`);
  return (['vi', 'en'] as const).map((locale) => ({
    pattern: new RegExp(
      '^' +
        escape((locale === 'vi' ? source : target)(...args)).replace(
          /__VALUE_\d+__/g,
          '([\\s\\S]*?)',
        ) +
        '$',
    ),
    vi: source,
    en: target,
  }));
});
export type FeedbackText = string | string[];
export function localizeFeedback(value: FeedbackText, locale: Locale): string {
  if (Array.isArray(value)) return value.map((part) => localizeFeedback(part, locale)).join(' ');
  const pair = pairs.get(value);
  if (pair) return pair[locale];
  for (const template of templates) {
    const match = template.pattern.exec(value);
    if (match) return template[locale](...match.slice(1));
  }
  return value;
}
/** For frontend feedback state only; never wrap product names, notes or imported cells. */
export function Feedback({ text }: { text: FeedbackText }) {
  return localizeFeedback(text, useLocale().locale);
}
