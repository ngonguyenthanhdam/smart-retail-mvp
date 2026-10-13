import { forecastCopy } from '@/i18n/vi';

const codes: Record<string, string> = {
  ...forecastCopy.errors,
  INSUFFICIENT_STOCK: 'Không đủ hàng còn hạn để bán. Kiểm tra tồn khả dụng và điều chỉnh số lượng.',
  STOCK_CHANGED: 'Tồn kho vừa thay đổi. Kiểm tra lại giỏ hàng rồi thử lại.',
  INVALID_DISCOUNT: 'Giảm giá phải từ 0 đến tổng tiền hàng.',
  STAFF_DISCOUNT_FORBIDDEN: 'Nhân viên không có quyền tự giảm giá. Liên hệ quản lý cửa hàng.',
  DISCOUNT_NOT_ALLOWED: 'Nhân viên không có quyền tự giảm giá. Liên hệ quản lý cửa hàng.',
  FRACTIONAL_QUANTITY_NOT_ALLOWED: 'Sản phẩm này bán theo số nguyên. Vui lòng kiểm tra số lượng.',
  PRODUCT_NOT_AVAILABLE_AT_STORE: 'Sản phẩm chưa được phép bán hoặc đã ngừng bán tại cửa hàng.',
  PURCHASE_ALREADY_RECEIVED: 'Phiếu này đã nhận hàng, không thể sửa hoặc nhận lần nữa.',
  PURCHASE_NOT_DRAFT: 'Chỉ có thể thay đổi phiếu nhập đang ở trạng thái nháp.',
  INVALID_EXPIRY_DATE: 'Sản phẩm cần hạn sử dụng hợp lệ; không thể nhận hàng đã hết hạn.',
  IDEMPOTENCY_CONFLICT: 'Giao dịch này đã được gửi với nội dung khác. Hãy kiểm tra lịch sử bán hàng.',
};
const messages: Record<string, string> = {
  'Invoice discount must not exceed subtotal.': 'Giảm giá không được lớn hơn tạm tính.',
  'Invoice discount cannot exceed subtotal.': 'Giảm giá không được lớn hơn tạm tính.',
  'Combine quantities into one line per product.': 'Gộp số lượng của cùng sản phẩm vào một dòng.',
  'This username or email is already in use.': 'Tên đăng nhập hoặc email đã được sử dụng.',
  'This SKU or barcode is already in use.': 'Mã sản phẩm hoặc mã vạch đã được sử dụng.',
  'SKU or barcode already exists.': 'Mã sản phẩm hoặc mã vạch đã tồn tại.',
  'This product is already configured for this store.': 'Sản phẩm đã có trong cấu hình cửa hàng.',
  'You cannot deactivate or demote your own account.': 'Bạn không thể vô hiệu hóa hoặc hạ quyền chính mình.',
  'The last active administrator cannot be deactivated or demoted.': 'Không thể vô hiệu hóa hoặc hạ quyền quản trị viên cuối cùng.',
  'Transfer or deactivate the active accounts assigned to this location first.': 'Hãy chuyển hoặc vô hiệu hóa tài khoản được gán tại địa điểm này trước.',
  'An active central warehouse already exists. Deactivate it before activating another.': 'Đã có kho trung tâm hoạt động. Ngừng hoạt động kho đó trước khi dùng kho khác.',
  'An active product requires an active category.': 'Sản phẩm đang hoạt động cần thuộc nhóm hàng đang hoạt động.',
  'Units cannot change after related transaction history exists.': 'Không thể đổi đơn vị sau khi sản phẩm đã phát sinh giao dịch.',
  'The base unit cannot change after inventory lots exist.': 'Không thể đổi đơn vị bán khi sản phẩm đã có lô tồn kho.',
  'All existing lots require expiry dates before enabling expiry tracking.': 'Bổ sung hạn dùng cho các lô hiện có trước khi bật theo dõi hạn.',
  'Move or deactivate active products first.': 'Chuyển hoặc ngừng kinh doanh sản phẩm trong nhóm trước.',
  'Move or deactivate active child categories first.': 'Chuyển hoặc ngừng sử dụng nhóm con trước.',
  'A category cannot be its own ancestor.': 'Nhóm hàng không thể là nhóm cha của chính nó.',
  'An active category requires an active parent.': 'Nhóm đang hoạt động cần có nhóm cha đang hoạt động.',
  'From date must not follow to date.': 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
  'Choose an ordered date range of at most 366 days.': 'Chọn khoảng ngày đúng thứ tự, tối đa 366 ngày.',
  'The data changed while saving. Refresh and try again.': 'Dữ liệu vừa thay đổi. Làm mới và thử lại.',
  'The request contains unsupported fields.': 'Yêu cầu có trường dữ liệu chưa được hỗ trợ. Làm mới trang rồi thử lại.',
  'Provide between 1 and 100 items.': 'Giao dịch cần từ 1 đến 100 sản phẩm.',
  'Enter a valid email address.': 'Nhập địa chỉ email hợp lệ.',
  'Select valid base and purchase units.': 'Chọn đơn vị bán và đơn vị nhập hợp lệ.',
  'Select an active product with valid units and conversion ratio.': 'Chọn sản phẩm đang hoạt động, có đơn vị và tỷ lệ quy đổi hợp lệ.',
  'This recommendation already has a decision. Refresh to review it.': 'Đề xuất đã được quyết định. Làm mới để xem kết quả.',
  'Accept or adjust this recommendation before creating a purchase draft.': 'Chấp nhận hoặc điều chỉnh đề xuất trước khi tạo phiếu nhập.',
  'A zero approved quantity does not require a purchase.': 'Số lượng duyệt bằng 0 nên không cần tạo phiếu nhập.',
  'The product needs a valid purchase conversion.': 'Sản phẩm cần tỷ lệ quy đổi đơn vị nhập hợp lệ.',
  'Historical imported purchases cannot be edited, cancelled or received.': 'Phiếu nhập từ lịch sử không thể sửa, hủy hoặc nhận hàng lại.',
  'Unknown product SKU.': 'Không tìm thấy mã sản phẩm.',
  'Unknown or inactive product SKU.': 'Mã sản phẩm không tồn tại hoặc đã ngừng hoạt động.',
  'Unknown or unavailable location code.': 'Mã cửa hàng hoặc kho không tồn tại hoặc không còn hoạt động.',
  'Unknown category or unit code.': 'Không tìm thấy mã nhóm hàng hoặc đơn vị tính.',
  'Sale reference already exists.': 'Mã hóa đơn đã tồn tại.',
  'Purchase reference already exists.': 'Mã phiếu nhập đã tồn tại.',
  'Duplicate lot number for this store/product in the file.': 'Tệp có mã lô trùng cho cùng sản phẩm tại cửa hàng.',
  'Opening inventory rejected: this store/product already has inventory lots.': 'Sản phẩm đã có lô tồn kho tại cửa hàng nên không thể nhập lại tồn đầu kỳ.',
  'All invoice lines must have the same store, date and invoice discount.': 'Các dòng cùng hóa đơn phải có cùng cửa hàng, ngày bán và giảm giá hóa đơn.',
  'This file has already been imported or is being processed.': 'Tệp này đã được nhập hoặc đang được xử lý.',
  'Preview expired or unavailable. Upload the file again.': 'Bản xem trước hết hạn. Hãy tải lại tệp.',
  'Data changed since preview. Upload the file again to review updated validation.': 'Dữ liệu đã thay đổi sau lần xem trước. Tải lại tệp để kiểm tra.',
  'No valid rows can be imported. Correct the file and upload again.': 'Không có dòng hợp lệ. Sửa tệp và tải lại.',
  'Choose a file.': 'Chọn tệp cần nhập.',
  'Choose a nonempty CSV/XLSX file no larger than 2 MB.': 'Chọn tệp CSV hoặc XLSX có dữ liệu, tối đa 2 MB.',
  'Use exactly one worksheet per import file.': 'Tệp nhập chỉ được có một trang tính.',
  'Use at most 1,000 data rows and 20 columns.': 'Sử dụng tối đa 1.000 dòng dữ liệu và 20 cột.',
  'Only .csv and .xlsx files are supported.': 'Chỉ hỗ trợ tệp CSV và XLSX.',
  'File cannot be read. Use a valid UTF-8 CSV or a small, unencrypted XLSX workbook.': 'Không đọc được tệp. Dùng CSV UTF-8 hoặc XLSX không có mật khẩu.',
  'Headers must be unique supported column names and include every required column. Download the template.': 'Tên cột phải đúng mẫu, không trùng và đủ cột bắt buộc. Hãy tải tệp mẫu.',
  'Provide a header and between 1 and 1,000 data rows.': 'Tệp cần hàng tiêu đề và từ 1 đến 1.000 dòng dữ liệu.',
};
const fields: Record<string, string> = { Quantity: 'Số lượng', 'Purchase quantity': 'Số lượng nhập', 'Unit cost': 'Giá vốn', 'Unit price': 'Đơn giá', 'Invoice discount': 'Giảm giá hóa đơn', 'Selling price': 'Giá bán', 'Safety stock': 'Tồn an toàn', 'Minimum stock': 'Tồn tối thiểu', 'From date': 'Ngày bắt đầu', 'To date': 'Ngày kết thúc', 'Expiry date': 'Hạn sử dụng', Name: 'Tên', Code: 'Mã', Username: 'Tên đăng nhập', Email: 'Email', Description: 'Nội dung', 'Full name': 'Họ và tên', Reason: 'Lý do', 'Decision note': 'Lý do', 'Shelf life': 'Hạn sử dụng', 'Purchase-to-base ratio': 'Tỷ lệ quy đổi' };

export function translateMessage(message: string, status = 400, code?: string): string {
  if (code && codes[code]) return codes[code];
  if (codes[message]) return codes[message];
  if (messages[message]) return messages[message];
  if (/[àáạảãăâđèéẹêìíịòóọôơùúụưỳýỵ]/i.test(message)) return message;
  const row = /^Row (\d+): (.*)$/.exec(message);
  if (row) return `Dòng ${row[1]}: ${translateMessage(row[2], status)}`;
  const missing = /^(.*) is required and must not exceed (\d+) characters\.$/.exec(message);
  if (missing) return `${fields[missing[1]] ?? 'Trường dữ liệu'} là bắt buộc, tối đa ${missing[2]} ký tự.`;
  const decimal = /^(.*) must be a non-negative decimal with at most (\d+) decimal places\.$/.exec(message);
  if (decimal) return `${fields[decimal[1]] ?? 'Giá trị'} phải từ 0 trở lên và có tối đa ${decimal[2]} chữ số thập phân.`;
  if (/not found|Unknown/i.test(message)) return 'Không tìm thấy dữ liệu phù hợp. Kiểm tra mã và làm mới trang.';
  if (/Select an? (active|valid|existing) store|store accounts require|one store|store for this/i.test(message)) return 'Chọn một cửa hàng đang hoạt động.';
  if (/Select an? (active|valid) location/i.test(message)) return 'Chọn cửa hàng hoặc kho đang hoạt động.';
  if (/Select a category/i.test(message)) return 'Chọn nhóm hàng.';
  if (/outside your assigned|role cannot|Only ADMIN|Only administrators|access.*changed|no longer.*access/i.test(message) || status === 403) return 'Bạn không có quyền thực hiện thao tác này trong phạm vi cửa hàng hiện tại.';
  if (/fraction|whole.*quantity|quantity.*whole|integer/i.test(message)) return 'Sản phẩm này cần số lượng nguyên. Kiểm tra đơn vị và số lượng.';
  if (/already (in use|exists)|duplicate/i.test(message)) return 'Mã hoặc thông tin này đã tồn tại. Hãy dùng giá trị khác.';
  if (/expiry|expired/i.test(message)) return 'Kiểm tra hạn sử dụng: hàng nhận phải còn hạn và không trước ngày nhận.';
  if (/must not exceed (\d+) characters/.test(message)) return `Nội dung tối đa ${message.match(/must not exceed (\d+)/)?.[1]} ký tự.`;
  if (/must be.*date|timestamp/.test(message)) return 'Nhập ngày hợp lệ theo định dạng yêu cầu; thời điểm cần kèm múi giờ.';
  if (/outside the allowed range|must be between/.test(message)) return 'Giá trị nằm ngoài phạm vi cho phép. Kiểm tra số lượng hoặc số tiền.';
  if (/Password/.test(message)) return 'Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte UTF-8.';
  if (/true or false/.test(message)) return 'Trường đúng/sai chỉ nhận true hoặc false.';
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (status === 409) return 'Dữ liệu đã thay đổi hoặc xung đột. Làm mới và kiểm tra trước khi thử lại.';
  if (status >= 500) return 'Hệ thống chưa thể xử lý yêu cầu. Kiểm tra kết quả đã lưu trước khi thử lại.';
  return 'Dữ liệu chưa hợp lệ. Kiểm tra các trường bắt buộc, mã sản phẩm và định dạng rồi thử lại.';
}

export const importInstructions: Record<string, string> = {
  PRODUCT: 'Chỉ thêm sản phẩm mới. Mã sản phẩm và mã vạch không được trùng. Nhóm hàng và đơn vị tính phải tồn tại. Trường đúng/sai dùng true hoặc false.',
  SALE: 'Nhập hóa đơn đã hoàn tất theo đơn vị bán. Giá vốn là tổng của từng dòng. Lặp lại giảm giá hóa đơn giống nhau trên mọi dòng; chỉ trừ một lần. Một dòng lỗi sẽ loại cả hóa đơn. Ngày dùng YYYY-MM-DD hoặc thời điểm có múi giờ.',
  INVENTORY: 'Nhập tồn đầu kỳ theo đơn vị bán. Chỉ nhận sản phẩm chưa có lô tại cửa hàng. Mã lô trong cùng sản phẩm/cửa hàng không được trùng; hàng theo dõi hạn dùng cần ngày hết hạn.',
  PURCHASE: 'Chỉ nhập phiếu lịch sử RECEIVED (đã nhận) hoặc CANCELLED (đã hủy). Phiếu đã nhận cần số lượng đơn vị bán gốc và ngày nhận. Giá vốn theo đơn vị nhập. Không thay đổi tồn kho.',
  EXPENSE: 'Nhập chi phí theo địa điểm và ngày phát sinh. Kiểm tra mã địa điểm, loại chi phí và số tiền trước khi xác nhận.',
};
export const importStatus: Record<string, string> = { PENDING: 'Chờ xác nhận', PROCESSING: 'Đang nhập', COMPLETED: 'Hoàn tất', PARTIAL: 'Nhập một phần', FAILED: 'Không hoàn tất' };
