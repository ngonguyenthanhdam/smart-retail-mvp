export type Locale = 'vi' | 'en';

/** Widen text while retaining every key and interpolation signature. */
export type DictionaryShape<T> = T extends (...args: infer A) => unknown
  ? (...args: A) => string
  : T extends string
    ? string
    : { [K in keyof T]: DictionaryShape<T[K]> };

export const localeCookie = 'retailsense-locale';
export const resolveLocale = (value: unknown): Locale => (value === 'en' ? 'en' : 'vi');
