'use client';
import { useLocale } from './provider';
export const vi = {
  replaceFile: (name: string) => `Thay thế ${name}`,
  removeProduct: (name: string) => `Bỏ ${name}`,
  validationCounts: (valid: string | number | undefined, invalid: string | number | undefined) =>
    `${valid} hợp lệ / ${invalid} lỗi`,
  noInvoices: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) =>
    `Không tìm thấy hóa đơn hoàn tất từ ${v0} đến ${v1} trong phạm vi ${v2}. Chưa đủ căn cứ kết luận doanh thu thực tế bằng 0. CSV huấn luyện không được dùng làm dữ liệu bán hàng.`,
  latestRecord: (v0: string | number | null | undefined) =>
    `Bản ghi gần nhất: ${v0}. Hãy đổi khoảng ngày hoặc kiểm tra dữ liệu đã nhập.`,
  uploading: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) => `Đang tải ${v0}/${v1}: ${v2}`,
  uploadValidated: (v0: string | number | null | undefined) =>
    `Đã tải lên ${v0} file · Kiểm tra đạt. Xác nhận để chuyển sang huấn luyện.`,
  uploadReview: (v0: string | number | null | undefined, v1: string | number | null | undefined) =>
    `Đã tải lên ${v0} file · ${v1}. Mở quản lý file bên dưới.`,
  manageFiles: (v0: string | number | null | undefined) => `Quản lý ${v0} file & kiểm tra dữ liệu`,
  calendarNote: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) =>
    `Toàn bộ dataset ${v0} (không lọc theo chuỗi/mô hình/test) · ${v1} → ${v2}. Màu đậm: bán nhiều; ô nhạt: lượng bằng 0.`,
  calendarLabel: (v0: string | number | null | undefined) => `Lịch bán hàng ${v0}`,
  salesQuantity: (v0: string | number | null | undefined) => `Lượng bán (${v0})`,
  densityNote: (v0: string | number | null | undefined, v1: string | number | null | undefined) =>
    `Histogram hai chiều · ${v0} điểm test mẫu · ${v1}. Ô đậm chứa nhiều điểm; gần đường chéo là dự báo sát thực tế.`,
  maeHelp: (v0: string | number | null | undefined) => `Sai lệch trung bình, đơn vị ${v0}.`,
  rmseHelp: (v0: string | number | null | undefined) => `Nhạy với sai lệch lớn, đơn vị ${v0}.`,
  actualForecast: (v0: string | number | null | undefined) => `Thực tế và dự báo · ${v0}`,
  wapeHelp: (v0: string | number | null | undefined, v1: string | number | null | undefined) =>
    `WAPE · test ${v0} ngày · toàn bộ chuỗi ${v1}. Thấp hơn tốt hơn.`,
  lowerBetter: (v0: string | number | null | undefined, v1: string | number | null | undefined) =>
    `${v0}: ${v1} — thấp hơn tốt hơn`,
  errorNote: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) => `${v0} · ${v1} ngày · chuỗi đang chọn · sai số = dự báo − thực tế (${v2}).`,
  pearsonHelp: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) =>
    `Pearson · toàn bộ ${v0} dòng train đủ lịch sử ${v1} · đến ${v2}. Không phụ thuộc mô hình/cửa sổ test; không chứng minh quan hệ nhân quả.`,
  missingHelp: (v0: string | number | null | undefined) =>
    `Toàn bộ tập train ${v0}. Lag/rolling thiếu ở đầu chuỗi do chưa đủ lịch sử, không phải lỗi CSV. Không tự điền 0; không áp dụng bộ lọc mô hình/cửa sổ test.`,
  requiredHistory: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) => `Dataset có ${v0} ngày cho chuỗi ngắn nhất; chế độ này cần ${v1} ngày. ${v2}`,
  dailyHistory: (v0: string | number | null | undefined) =>
    `Lịch sử và lượng bán dự kiến mỗi ngày của ${v0}`,
  eligibleHistory: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
  ) => `${v0}/${v1} mặt hàng đủ lịch sử`,
  validating: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) => `Đang kiểm tra ${v0}/${v1}: ${v2}`,
  validatedFiles: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
  ) =>
    `Đã kiểm tra ${v0}/${v1} tệp. Mở từng kết quả để xem lỗi hoặc nhập dữ liệu. Chưa ghi dữ liệu nghiệp vụ.`,
  importResult: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) => `Đã nhập ${v0} dòng từ ${v1}; ${v2} dòng bị từ chối.`,
  cancelledFile: (v0: string | number | null | undefined) =>
    `Đã hủy ${v0}. Chưa ghi dữ liệu nghiệp vụ.`,
  fileType: (v0: string | number | null | undefined) => `Loại dữ liệu ${v0}`,
  pendingRows: (v0: string | number | null | undefined) => `${v0} dòng chờ kiểm tra/nhập`,
  importedRows: (v0: string | number | null | undefined, v1: string | number | null | undefined) =>
    `${v0} đã nhập · ${v1} lỗi`,
  illustration: (v0: string | number | null | undefined) => `Hình minh họa ${v0}`,
  addProduct: (v0: string | number | null | undefined, v1: string | number | null | undefined) =>
    `Thêm ${v0}, ${v1}`,
  available: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) => `Còn ${v0} ${v1}${v2}`,
  decreaseProduct: (v0: string | number | null | undefined) => `Giảm ${v0}`,
  productQuantity: (v0: string | number | null | undefined) => `Số lượng ${v0}`,
  increaseProduct: (v0: string | number | null | undefined) => `Tăng ${v0}`,
};
export const en = {
  replaceFile: (name: string) => `Replace ${name}`,
  removeProduct: (name: string) => `Remove ${name}`,
  validationCounts: (valid: string | number | undefined, invalid: string | number | undefined) =>
    `${valid} valid / ${invalid} errors`,
  noInvoices: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) =>
    `No completed invoices were found from ${v0} to ${v1} within ${v2}. There is not enough evidence to conclude that actual revenue is zero. Training CSV files are not used as sales records.`,
  latestRecord: (v0: string | number | null | undefined) =>
    `Latest record: ${v0}. Change the date range or check imported data.`,
  uploading: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) => `Uploading ${v0}/${v1}: ${v2}`,
  uploadValidated: (v0: string | number | null | undefined) =>
    `${v0} files uploaded · Validation passed. Confirm to continue to training.`,
  uploadReview: (v0: string | number | null | undefined, v1: string | number | null | undefined) =>
    `${v0} files uploaded · ${v1}. Open file management below.`,
  manageFiles: (v0: string | number | null | undefined) => `Manage ${v0} files & validate data`,
  calendarNote: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) =>
    `Entire dataset ${v0} (no series/model/test filter) · ${v1} → ${v2}. Darker cells: more sales; pale cells: zero quantity.`,
  calendarLabel: (v0: string | number | null | undefined) => `Sales calendar ${v0}`,
  salesQuantity: (v0: string | number | null | undefined) => `Sales quantity (${v0})`,
  densityNote: (v0: string | number | null | undefined, v1: string | number | null | undefined) =>
    `Two-dimensional histogram · ${v0} sample test points · ${v1}. Darker cells contain more points; proximity to the diagonal indicates more accurate predictions.`,
  maeHelp: (v0: string | number | null | undefined) => `Mean absolute error, measured in ${v0}.`,
  rmseHelp: (v0: string | number | null | undefined) =>
    `Sensitive to large errors, measured in ${v0}.`,
  actualForecast: (v0: string | number | null | undefined) => `Actual and forecast · ${v0}`,
  wapeHelp: (v0: string | number | null | undefined, v1: string | number | null | undefined) =>
    `WAPE · ${v0}-day test · all ${v1} series. Lower is better.`,
  lowerBetter: (v0: string | number | null | undefined, v1: string | number | null | undefined) =>
    `${v0}: ${v1} — lower is better`,
  errorNote: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) => `${v0} · ${v1} days · selected series · error = forecast − actual (${v2}).`,
  pearsonHelp: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) =>
    `Pearson · all ${v0} training rows with sufficient ${v1} history · through ${v2}. Independent of model/test window; does not establish causality.`,
  missingHelp: (v0: string | number | null | undefined) =>
    `Full ${v0} training set. Missing lag/rolling values at the start reflect insufficient history, not CSV errors. No automatic zero-filling; model/test-window filters do not apply.`,
  requiredHistory: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) => `The shortest series has ${v0} days; this mode requires ${v1} days. ${v2}`,
  dailyHistory: (v0: string | number | null | undefined) =>
    `Daily sales history and expected quantity for ${v0}`,
  eligibleHistory: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
  ) => `${v0}/${v1} products with sufficient history`,
  validating: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) => `Validating ${v0}/${v1}: ${v2}`,
  validatedFiles: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
  ) =>
    `Validated ${v0}/${v1} files. Open each result to review errors or import data. No business data has been written.`,
  importResult: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) => `Imported ${v0} rows from ${v1}; ${v2} rows rejected.`,
  cancelledFile: (v0: string | number | null | undefined) =>
    `Cancelled ${v0}. No business data has been written.`,
  fileType: (v0: string | number | null | undefined) => `Data type for ${v0}`,
  pendingRows: (v0: string | number | null | undefined) => `${v0} rows pending validation/import`,
  importedRows: (v0: string | number | null | undefined, v1: string | number | null | undefined) =>
    `${v0} imported · ${v1} errors`,
  illustration: (v0: string | number | null | undefined) => `Illustration of ${v0}`,
  addProduct: (v0: string | number | null | undefined, v1: string | number | null | undefined) =>
    `Add ${v0}, ${v1}`,
  available: (
    v0: string | number | null | undefined,
    v1: string | number | null | undefined,
    v2: string | number | null | undefined,
  ) => `Available: ${v0} ${v1}${v2}`,
  decreaseProduct: (v0: string | number | null | undefined) => `Decrease ${v0}`,
  productQuantity: (v0: string | number | null | undefined) => `Quantity for ${v0}`,
  increaseProduct: (v0: string | number | null | undefined) => `Increase ${v0}`,
};
export function useDynamic() {
  return useLocale().locale === 'en' ? en : vi;
}
