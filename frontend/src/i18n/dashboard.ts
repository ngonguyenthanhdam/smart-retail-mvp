// The pilot preserves the existing Vietnamese locale. English copy is ready for a later locale switch.
export const dashboardCopy = {
  vi: {
    overview: 'TỔNG QUAN', sales: 'Tới quầy bán hàng', periodSummary: 'Kết quả trong kỳ', pending: 'Bộ lọc chưa áp dụng', filters: 'Bộ lọc báo cáo',
    inventorySummary: 'Hàng hóa cần chú ý', lowStock: 'Tồn kho thấp', lowStockHint: 'Cặp cửa hàng – sản phẩm chạm ngưỡng tồn tối thiểu',
    expired: 'Lô đã hết hạn', expiredHint: 'Còn số lượng tồn, cần kiểm tra', expiring: 'Lô sắp hết hạn', expiringHint: 'Trong 7 ngày, gồm hôm nay',
    checkInventory: 'Kiểm tra tồn kho', stockDate: 'Tồn kho ngày', inventoryScope: 'Tồn kho hiện tại · không theo bộ lọc ngày',
    unit: 'đơn vị', products: 'Xem danh mục', ranking: 'Xếp theo lượng bán trong kỳ',
    storeScope: 'Toàn bộ cửa hàng · cùng khoảng ngày', storeDescription: 'Chi phí chung chưa phân bổ cho từng cửa hàng.',
    chartUnit: 'Doanh thu · VND', chartExplore: 'Chọn ngày để xem doanh thu',
    chartHelp: 'Dùng phím mũi tên để xem từng ngày; Home/End để tới đầu/cuối kỳ.', chartEmpty: 'Chưa có dữ liệu doanh thu', emptyHint: 'Thử khoảng ngày hoặc cửa hàng khác.',
    quickActions: 'Đi tới nghiệp vụ', stockAction: 'Quản lý tồn kho', forecastAction: 'Dự báo bán hàng', alertsAction: 'Cảnh báo tồn kho',
    tableHint: 'Cuộn ngang để xem đầy đủ số liệu', storeError: 'Chưa tải được danh sách cửa hàng.', retry: 'Thử lại', reportError: 'Chưa tải được báo cáo',
    snapshot: 'Số liệu từ giao dịch đã ghi nhận', collapseNav: 'Thu gọn điều hướng', expandNav: 'Mở rộng điều hướng',
  },
  en: {
    overview: 'OVERVIEW', sales: 'Open point of sale', periodSummary: 'Period performance', pending: 'Unapplied filters', filters: 'Report filters',
    inventorySummary: 'Inventory attention', lowStock: 'Low stock', lowStockHint: 'Store–product pairs at or below minimum stock',
    expired: 'Expired lots', expiredHint: 'Remaining stock to review', expiring: 'Expiring soon', expiringHint: 'Within 7 days, including today',
    checkInventory: 'Review inventory', stockDate: 'Inventory as of', inventoryScope: 'Current inventory · independent of sales dates',
    unit: 'units', products: 'View catalog', ranking: 'Ranked by quantity sold in this period',
    storeScope: 'All stores · same date range', storeDescription: 'Company expenses are not allocated to individual stores.',
    chartUnit: 'Revenue · VND', chartExplore: 'Choose a day to inspect revenue',
    chartHelp: 'Use arrow keys to explore each day; Home/End to reach the first/last day.', chartEmpty: 'No revenue data yet', emptyHint: 'Try a different date range or store.',
    quickActions: 'Go to operations', stockAction: 'Manage inventory', forecastAction: 'Sales forecasts', alertsAction: 'Inventory alerts',
    tableHint: 'Scroll horizontally to view all figures', storeError: 'Could not load stores.', retry: 'Try again', reportError: 'Could not load the report',
    snapshot: 'Based on recorded transactions', collapseNav: 'Collapse navigation', expandNav: 'Expand navigation',
  },
} as const;
