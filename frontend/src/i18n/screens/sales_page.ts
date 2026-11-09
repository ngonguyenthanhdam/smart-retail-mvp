import type { DictionaryShape } from '../types';
export const vi = {
  storeTransactions: 'GIAO DỊCH TẠI CỬA HÀNG',
  sales: 'Bán hàng',
  selectProductsReviewTheCartAndComplete: 'Chọn hàng, kiểm tra giỏ và hoàn tất giao dịch.',
  salesMode: 'Chế độ bán hàng',
  pointOfSale: 'Quầy bán hàng',
  history: 'Lịch sử',
  close: 'Đóng',
  salesHistory: 'Lịch sử bán hàng',
  lookUpRecordedStoreInvoices: 'Tra cứu hóa đơn đã ghi nhận tại cửa hàng.',
} as const;
export const en = {
  storeTransactions: 'STORE TRANSACTIONS',
  sales: 'Sales',
  selectProductsReviewTheCartAndComplete: 'Select products, review the cart and complete the sale.',
  salesMode: 'Sales mode',
  pointOfSale: 'Point of sale',
  history: 'History',
  close: 'Close',
  salesHistory: 'Sales history',
  lookUpRecordedStoreInvoices: 'Look up recorded store invoices.',
} satisfies DictionaryShape<typeof vi>;
