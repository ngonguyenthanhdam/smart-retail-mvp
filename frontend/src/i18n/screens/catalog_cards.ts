import type { DictionaryShape } from '../types';
export const vi = {
  productDisplay: 'Cách hiển thị sản phẩm',
  images: 'Hình ảnh',
  list: 'Danh sách',
  availableForSale: 'Đang kinh doanh',
  discontinued: 'Ngừng kinh doanh',
  uncategorized: 'Chưa phân nhóm',
  expiryTracked: 'Có hạn dùng',
  sellingPrice: 'Giá bán',
  defaultCost: 'Giá vốn mặc định',
} as const;
export const en = {
  productDisplay: 'Product display',
  images: 'Images',
  list: 'List',
  availableForSale: 'Available for sale',
  discontinued: 'Discontinued',
  uncategorized: 'Uncategorized',
  expiryTracked: 'Expiry tracked',
  sellingPrice: 'Selling price',
  defaultCost: 'Default cost',
} satisfies DictionaryShape<typeof vi>;
