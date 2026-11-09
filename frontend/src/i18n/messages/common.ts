import type { DictionaryShape } from '../types';
export const vi = {
  locale: 'vi',
  brand: 'RetailSense',
  description: 'Quản lý cửa hàng, bán hàng và dự báo nhu cầu trong một không gian.',
} as const;
export const en = {
  locale: 'en',
  brand: 'RetailSense',
  description: 'A workspace for retail operations and demand planning.',
} satisfies DictionaryShape<typeof vi>;
