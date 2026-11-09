import type { DictionaryShape } from '../types';
export const vi = {
  historyCoverageHasBeenConfirmed: 'Đã ghi nhận phạm vi lịch sử đầy đủ.',
  forecastData: 'Dữ liệu dùng để dự báo',
  checking: 'Đang kiểm tra…',
  atLeast30ConsecutiveDaysOfConfirmed:
    'Cần ít nhất 30 ngày liên tục đã xác nhận đầy đủ. Ngày không có giao dịch chỉ được tính là bán 0 khi nằm trong khoảng đã xác nhận.',
  historyReviewRequired: 'Cần kiểm tra lịch sử',
  sufficientHistory: 'Đủ lịch sử',
  importSalesHistory: 'Nhập lịch sử bán hàng',
  confirmCompleteImportedHistory: 'Xác nhận lịch sử đã nhập đầy đủ',
  selectAStoreAboveToConfirmIts: 'Chọn một cửa hàng ở phía trên để xác nhận lịch sử.',
  confirmOnlyAfterReconcilingAllTransactionsAnd:
    'Chỉ xác nhận sau khi đối chiếu đủ giao dịch và các ngày không bán. Thao tác này không tạo thêm giao dịch bán hàng.',
  fromDate: 'Từ ngày',
  toDateBeforeToday: 'Đến ngày (trước hôm nay)',
  evidenceForConfirmation: 'Căn cứ xác nhận',
  forExampleReconciledTheSalesLedgerIncluding:
    'Ví dụ: đã đối chiếu sổ bán hàng, gồm cả ngày đóng cửa và ngày bán 0.',
  iConfirmThatHistoryForTheSelected:
    'Tôi xác nhận lịch sử của các mặt hàng đã chọn đầy đủ trong khoảng này.',
  saving: 'Đang lưu…',
  saveConfirmation: 'Lưu xác nhận',
  exportDataToTrainANewVersion: 'Xuất dữ liệu để huấn luyện phiên bản mới',
  syntheticDataIsExcludedFromTrainingBy:
    'Dữ liệu mô phỏng được loại khỏi tập huấn luyện mặc định. Xuất tệp không tự huấn luyện hoặc thay mô hình đang dùng.',
  includeSyntheticDataToTestTheWorkflow: 'Bao gồm dữ liệu mô phỏng để thử luồng',
  downloadCsv: 'Tải CSV',
} as const;
export const en = {
  historyCoverageHasBeenConfirmed: 'History coverage has been confirmed.',
  forecastData: 'Forecast data',
  checking: 'Checking…',
  atLeast30ConsecutiveDaysOfConfirmed:
    'At least 30 consecutive days of confirmed coverage are required. Days without transactions count as zero sales only within a confirmed period.',
  historyReviewRequired: 'History review required',
  sufficientHistory: 'Sufficient history',
  importSalesHistory: 'Import sales history',
  confirmCompleteImportedHistory: 'Confirm complete imported history',
  selectAStoreAboveToConfirmIts: 'Select a store above to confirm its history.',
  confirmOnlyAfterReconcilingAllTransactionsAnd:
    'Confirm only after reconciling all transactions and days without sales. This action does not create sales transactions.',
  fromDate: 'From date',
  toDateBeforeToday: 'To date (before today)',
  evidenceForConfirmation: 'Evidence for confirmation',
  forExampleReconciledTheSalesLedgerIncluding:
    'For example: reconciled the sales ledger, including closed days and zero-sales days.',
  iConfirmThatHistoryForTheSelected:
    'I confirm that history for the selected products is complete for this period.',
  saving: 'Saving…',
  saveConfirmation: 'Save confirmation',
  exportDataToTrainANewVersion: 'Export data to train a new version',
  syntheticDataIsExcludedFromTrainingBy:
    'Synthetic data is excluded from training by default. Exporting a file does not train or replace the current model.',
  includeSyntheticDataToTestTheWorkflow: 'Include synthetic data to test the workflow',
  downloadCsv: 'Download CSV',
} satisfies DictionaryShape<typeof vi>;
