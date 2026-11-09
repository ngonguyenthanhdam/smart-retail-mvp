import type { DictionaryShape } from '../types';
export const vi = {
  filters: 'Bộ lọc',
} as const;
export const en = {
  filters: 'Filters',
} satisfies DictionaryShape<typeof vi>;
