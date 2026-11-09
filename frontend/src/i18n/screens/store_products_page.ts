import type { DictionaryShape } from '../types';
export const vi = {
  productsAtThisStore: 'sản phẩm tại cửa hàng',
} as const;
export const en = {
  productsAtThisStore: 'products at this store',
} satisfies DictionaryShape<typeof vi>;
