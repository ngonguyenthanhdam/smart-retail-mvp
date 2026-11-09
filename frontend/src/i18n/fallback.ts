import type { DictionaryShape } from './types';

/** Missing or empty translations fall back to Vietnamese, never a raw key. */
export function withFallback<T>(base: T, candidate: unknown): DictionaryShape<T> {
  if (typeof base === 'string')
    return (
      typeof candidate === 'string' && candidate.trim() ? candidate : base
    ) as DictionaryShape<T>;
  if (typeof base === 'function')
    return (typeof candidate === 'function' ? candidate : base) as DictionaryShape<T>;
  if (Array.isArray(base)) {
    const values = Array.isArray(candidate) ? candidate : [];
    return base.map((value, index) =>
      withFallback(value, values[index]),
    ) as unknown as DictionaryShape<T>;
  }
  if (base && typeof base === 'object') {
    const values =
      candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>) : {};
    return Object.fromEntries(
      Object.entries(base).map(([key, value]) => [key, withFallback(value, values[key])]),
    ) as DictionaryShape<T>;
  }
  return base as DictionaryShape<T>;
}
