import type { DictionaryShape } from '../types';
export const vi = {
  sold: 'Đã bán',
  expected: 'Dự kiến',
  daily: '· theo ngày',
  noDataPointsYet: 'Chưa có điểm dữ liệu',
  salesQuantityFor: 'Lượng bán của',
  solidLineSoldDashedLineExpectedDetailed:
    'Đường liền: đã bán. Đường đứt: dự kiến. Số liệu chi tiết ở bảng bên dưới.',
  viewDailySalesQuantity: 'Xem lượng bán theo ngày',
  viewDailyFigures: 'Xem số liệu từng ngày',
  dailySalesQuantityAndForecast: 'Lượng bán và dự báo theo ngày',
  date: 'Ngày',
  dataType: 'Loại số liệu',
  quantity: 'Số lượng',
} as const;
export const en = {
  sold: 'Sold',
  expected: 'Expected',
  daily: '· daily',
  noDataPointsYet: 'No data points yet',
  salesQuantityFor: 'Sales quantity for',
  solidLineSoldDashedLineExpectedDetailed:
    'Solid line: sold. Dashed line: expected. Detailed figures are in the table below.',
  viewDailySalesQuantity: 'View daily sales quantity',
  viewDailyFigures: 'View daily figures',
  dailySalesQuantityAndForecast: 'Daily sales quantity and forecast',
  date: 'Date',
  dataType: 'Data type',
  quantity: 'Quantity',
} satisfies DictionaryShape<typeof vi>;
