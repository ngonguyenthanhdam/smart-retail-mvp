import type { DictionaryShape } from '../types';
export const vi = {
  yourProducts: 'HÀNG HÓA CỦA BẠN',
  productsInTheCatalog: 'sản phẩm trong danh mục',
} as const;
export const en = {
  yourProducts: 'YOUR PRODUCTS',
  productsInTheCatalog: 'products in the catalog',
} satisfies DictionaryShape<typeof vi>;
