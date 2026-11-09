import type { Locale } from './types';
export type SourceColumn = {
  label: string;
  kind?: 'money' | 'quantity' | 'unit';
  unitKey?: string;
};
const labels: Record<string, string> = {
  'Doanh thu (VND)': 'Revenue (VND)',
  'Giá vốn (VND)': 'Cost of goods sold (VND)',
  'Lợi nhuận gộp (VND)': 'Gross profit (VND)',
  'Hóa đơn': 'Invoices',
  'Chi phí (VND)': 'Expenses (VND)',
  'Kỳ này (VND)': 'Current period (VND)',
  'Kỳ trước (VND)': 'Previous period (VND)',
  'Chênh lệch (VND)': 'Difference (VND)',
  'Thay đổi (%)': 'Change (%)',
  'Từ ngày kỳ trước': 'Previous period start',
  'Đến ngày kỳ trước': 'Previous period end',
  Mã: 'SKU',
  'Sản phẩm': 'Product',
  'Số lượng': 'Quantity',
  'Đơn vị': 'Unit',
  'Cửa hàng': 'Store',
  Loại: 'Type',
  'Mức độ': 'Severity',
  'Nội dung': 'Message',
  'Phát hiện': 'Detected',
  'Đề xuất': 'Recommended quantity',
  'Tạo lúc': 'Created at',
  'Lượng dự kiến': 'Expected quantity',
  'Doanh thu dự kiến (VND)': 'Expected revenue (VND)',
};
const schemas: Record<string, string[]> = {
  getSalesSummary: ['Doanh thu (VND)', 'Giá vốn (VND)', 'Lợi nhuận gộp (VND)', 'Hóa đơn'],
  getExpenseSummary: ['Chi phí (VND)'],
  getTopSellingProducts: ['Mã', 'Sản phẩm', 'Số lượng', 'Đơn vị'],
  getRevenueComparison: [
    'Kỳ này (VND)',
    'Kỳ trước (VND)',
    'Chênh lệch (VND)',
    'Thay đổi (%)',
    'Từ ngày kỳ trước',
    'Đến ngày kỳ trước',
  ],
  getInventoryAlerts: ['Sản phẩm', 'Cửa hàng', 'Loại', 'Mức độ', 'Nội dung', 'Phát hiện'],
  getReplenishmentSuggestions: ['Sản phẩm', 'Cửa hàng', 'Đề xuất', 'Đơn vị', 'Tạo lúc'],
  getForecastResults: [
    'Sản phẩm',
    'Cửa hàng',
    'Lượng dự kiến',
    'Đơn vị',
    'Doanh thu dự kiến (VND)',
  ],
};
export function sourceColumns(tool: string, locale: Locale): Record<string, SourceColumn> {
  return Object.fromEntries(
    (schemas[tool] ?? []).map((key) => [
      key,
      {
        label: locale === 'en' ? labels[key] : key,
        kind: key.endsWith('(VND)')
          ? 'money'
          : key === 'Đơn vị'
            ? 'unit'
            : ['Số lượng', 'Đề xuất', 'Lượng dự kiến'].includes(key)
              ? 'quantity'
              : undefined,
        unitKey: 'Đơn vị',
      },
    ]),
  );
}
export const sourceTitles: Record<string, { vi: string; en: string }> = {
  getSalesSummary: { vi: 'Báo cáo bán hàng', en: 'Sales report' },
  getExpenseSummary: { vi: 'Báo cáo chi phí', en: 'Expense report' },
  getTopSellingProducts: { vi: 'Sản phẩm bán chạy', en: 'Best-selling products' },
  getRevenueComparison: { vi: 'So sánh doanh thu', en: 'Revenue comparison' },
  getInventoryAlerts: { vi: 'Cảnh báo tồn kho đã lưu', en: 'Saved inventory alerts' },
  getReplenishmentSuggestions: {
    vi: 'Đề xuất nhập đang chờ xem xét',
    en: 'Pending purchase recommendations',
  },
  getForecastResults: { vi: 'Dự báo đã lưu', en: 'Saved forecasts' },
};
