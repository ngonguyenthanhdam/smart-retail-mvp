import type { DictionaryShape } from '../types';
export const vi = {
  'ai-center': {
    label: 'AI Center',
    description: 'Dữ liệu, huấn luyện và trợ lý kinh doanh.',
  },
  dashboard: {
    label: 'Tổng quan',
    description: 'Bức tranh kinh doanh của cửa hàng.',
  },
  stores: {
    label: 'Cửa hàng & kho',
    description: 'Quản lý địa điểm kinh doanh.',
  },
  users: {
    label: 'Nhân sự',
    description: 'Tài khoản và quyền truy cập.',
  },
  products: {
    label: 'Sản phẩm',
    description: 'Danh mục hàng hóa.',
  },
  inventory: {
    label: 'Tồn kho',
    description: 'Số lượng và hạn dùng.',
  },
  purchases: {
    label: 'Nhập hàng',
    description: 'Phiếu nhập và nhận hàng.',
  },
  sales: {
    label: 'Bán hàng',
    description: 'Tạo và tra cứu hóa đơn.',
  },
  expenses: {
    label: 'Chi phí',
    description: 'Chi phí vận hành.',
  },
  imports: {
    label: 'Nhập dữ liệu',
    description: 'Nhập lịch sử từ tệp CSV hoặc Excel.',
  },
  forecasts: {
    label: 'Dự báo bán hàng',
    description: 'Dự kiến nhu cầu trong các tháng tới.',
  },
  replenishment: {
    label: 'Đề xuất nhập hàng',
    description: 'Chuẩn bị hàng theo nhu cầu.',
  },
  alerts: {
    label: 'Cảnh báo tồn kho',
    description: 'Những sản phẩm cần chú ý.',
  },
} as const;
export const en = {
  'ai-center': {
    label: 'AI Center',
    description: 'Data, model training and business assistant.',
  },
  dashboard: {
    label: 'Dashboard',
    description: 'A shared view of your stores, stock, and performance.',
  },
  stores: {
    label: 'Stores',
    description: 'One place for your central warehouse and store locations.',
  },
  users: {
    label: 'Users',
    description: 'Manage accounts and store access.',
  },
  products: {
    label: 'Products',
    description: 'A consistent product catalog for every store.',
  },
  inventory: {
    label: 'Inventory',
    description: 'Track stock by location, product, and lot.',
  },
  purchases: {
    label: 'Purchases',
    description: 'Follow incoming stock from purchase draft to receipt.',
  },
  sales: {
    label: 'Sales',
    description: 'Record store sales and review transaction history.',
  },
  expenses: {
    label: 'Expenses',
    description: 'Keep operating expenses organized across the business.',
  },
  imports: {
    label: 'Import Data',
    description: 'Bring existing retail records into your workspace.',
  },
  forecasts: {
    label: 'AI Forecast',
    description: 'Plan ahead with demand forecasts for each store and product.',
  },
  replenishment: {
    label: 'Replenishment',
    description: 'Review stock recommendations and plan the next purchase.',
  },
  alerts: {
    label: 'Alerts',
    description: 'Keep inventory risks visible across your stores.',
  },
} satisfies DictionaryShape<typeof vi>;
