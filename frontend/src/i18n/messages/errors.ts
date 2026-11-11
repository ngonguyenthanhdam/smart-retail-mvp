import { vi as forecastsVi, en as forecastsEn } from './forecastCopy';
export const vi = {
  codes: {
    DEFAULT_PRICE_REQUIRED: 'Bổ sung giá bán mặc định lớn hơn 0 trước khi gán sản phẩm cho cửa hàng.',
    STOCK_REMAINS_CONFIRMATION_REQUIRED: 'Sản phẩm còn tồn kho. Xác nhận ngừng bán để tiếp tục; tồn kho và lịch sử được giữ nguyên.',
    ...forecastsVi.errors,
    INSUFFICIENT_STOCK:
      'Không đủ hàng còn hạn để bán. Kiểm tra tồn khả dụng và điều chỉnh số lượng.',
    STOCK_CHANGED: 'Tồn kho vừa thay đổi. Kiểm tra lại giỏ hàng rồi thử lại.',
    INVALID_DISCOUNT: 'Giảm giá phải từ 0 đến tổng tiền hàng.',
    STAFF_DISCOUNT_FORBIDDEN: 'Nhân viên không có quyền tự giảm giá. Liên hệ quản lý cửa hàng.',
    DISCOUNT_NOT_ALLOWED: 'Nhân viên không có quyền tự giảm giá. Liên hệ quản lý cửa hàng.',
    FRACTIONAL_QUANTITY_NOT_ALLOWED: 'Sản phẩm này bán theo số nguyên. Vui lòng kiểm tra số lượng.',
    PRODUCT_NOT_AVAILABLE_AT_STORE: 'Sản phẩm chưa được phép bán hoặc đã ngừng bán tại cửa hàng.',
    PURCHASE_ALREADY_RECEIVED: 'Phiếu này đã nhận hàng, không thể sửa hoặc nhận lần nữa.',
    PURCHASE_NOT_DRAFT: 'Chỉ có thể thay đổi phiếu nhập đang ở trạng thái nháp.',
    INVALID_EXPIRY_DATE: 'Sản phẩm cần hạn sử dụng hợp lệ; không thể nhận hàng đã hết hạn.',
    IDEMPOTENCY_CONFLICT:
      'Giao dịch này đã được gửi với nội dung khác. Hãy kiểm tra lịch sử bán hàng.',
  },
  status: {
    '401': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    '403': 'Bạn không có quyền thực hiện thao tác này trong phạm vi cửa hàng hiện tại.',
    '409': 'Dữ liệu đã thay đổi hoặc xung đột. Làm mới và kiểm tra trước khi thử lại.',
    '500': 'Hệ thống chưa thể xử lý yêu cầu. Kiểm tra kết quả đã lưu trước khi thử lại.',
    default: 'Chưa thể hoàn tất yêu cầu. Kiểm tra kết nối và thử lại.',
  },
};
export const en = {
  codes: {
    ...forecastsEn.errors,
    DEFAULT_PRICE_REQUIRED: 'Set a positive default selling price before assigning the product to a store.',
    STOCK_REMAINS_CONFIRMATION_REQUIRED: 'Stock remains. Confirm discontinuation to continue; inventory and history are preserved.',
    ...{
      INSUFFICIENT_STOCK:
        'There is not enough unexpired stock. Check available stock and adjust the quantity.',
      STOCK_CHANGED: 'Inventory has changed. Review the cart and try again.',
      INVALID_DISCOUNT: 'The discount must be between zero and the subtotal.',
      STAFF_DISCOUNT_FORBIDDEN: 'Staff cannot apply discounts. Contact a store manager.',
      DISCOUNT_NOT_ALLOWED: 'Staff cannot apply discounts. Contact a store manager.',
      FRACTIONAL_QUANTITY_NOT_ALLOWED:
        'This product requires whole quantities. Check the unit and quantity.',
      PRODUCT_NOT_AVAILABLE_AT_STORE:
        'This product is unavailable or no longer sold at this store.',
      PURCHASE_ALREADY_RECEIVED:
        'This order has already been received and cannot be edited or received again.',
      PURCHASE_NOT_DRAFT: 'Only draft purchase orders can be changed.',
      INVALID_EXPIRY_DATE: 'A valid expiry date is required; expired goods cannot be received.',
      IDEMPOTENCY_CONFLICT:
        'This transaction was submitted with different details. Check sales history.',
    },
  },
  status: {
    '401': 'Your session has expired. Please sign in again.',
    '403': 'You do not have permission to perform this action within the current store scope.',
    '409': 'The data changed or conflicts with another record. Refresh and review before retrying.',
    '500': 'The system could not process the request. Check saved results before retrying.',
    default: 'Could not complete the request. Check your connection and try again.',
  },
};
