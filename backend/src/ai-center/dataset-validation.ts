import { parse } from 'csv-parse/sync';
import { AI_LIMITS } from './ai-core';

export type DataKind = 'SALES' | 'PRODUCTS' | 'INVENTORY';
export type Mapping = Record<string, string>;
export type DataIssue = { code: string; file: string; row: number; column: string; reason: string; fix: string };
export type DataRow = { row: number; values: Record<string, string> };
export type FileValidation = { kind: DataKind | null; status: string; columns: string[]; mapping: Mapping; ignoredColumns: string[];
  issues: DataIssue[]; issueCount: number; rows: DataRow[]; totalRows: number; sample: DataRow[] };
export const DATA_FIELDS: Record<DataKind, { required: string[]; optional: string[] }> = {
  SALES: { required: ['date', 'store_id', 'product_id', 'quantity', 'unit_code'], optional: ['transaction_id', 'line_id', 'source'] },
  PRODUCTS: { required: ['product_id', 'name', 'unit_code'], optional: ['store_id', 'source'] },
  INVENTORY: { required: ['date', 'store_id', 'product_id', 'quantity', 'unit_code'], optional: ['lot_number', 'source'] },
};
const aliases: Record<string, string[]> = {
  date: ['date', 'sale_date', 'sales_date', 'dt', 'ngay', 'ngay_ban', 'received_date', 'snapshot_date'],
  store_id: ['store_id', 'store_code', 'location_id', 'location_code', 'ma_cua_hang', 'cua_hang'],
  product_id: ['product_id', 'product_sku', 'sku', 'item_id', 'ma_san_pham', 'ma_hang'],
  quantity: ['quantity', 'qty', 'sales_quantity', 'so_luong', 'quantity_on_hand', 'stock_quantity', 'ton_kho'],
  unit_code: ['unit_code', 'base_unit_code', 'unit', 'don_vi', 'don_vi_tinh'],
  name: ['name', 'product_name', 'ten_san_pham', 'ten_hang'],
  transaction_id: ['transaction_id', 'sale_reference', 'invoice_number', 'ma_hoa_don'],
  line_id: ['line_id', 'sale_item_id', 'ma_dong'], lot_number: ['lot_number', 'lot', 'ma_lo'], source: ['source', 'nguon'],
};
const normalizeHeader = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').trim().toLowerCase().replace(/[\s-]+/g, '_');
export const csvCell = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
export function snapshotCsv(rows: Record<string, string>[]) {
  const columns = ['date', 'store_id', 'product_id', 'quantity', 'unit_code', 'source'];
  return columns.join(',') + '\n' + rows.map(row => columns.map(c => csvCell(row[c])).join(',')).join('\n') + '\n';
}
export function validateCsv(name: string, bytes: Buffer, requestedKind?: DataKind, supplied?: Mapping): FileValidation {
  const result: FileValidation = { kind: null, status: 'INVALID_FORMAT', columns: [], mapping: {}, ignoredColumns: [], issues: [], issueCount: 0, rows: [], totalRows: 0, sample: [] };
  const issue = (code: string, row: number, column: string, reason: string, fix: string) => {
    result.issueCount++; if (result.issues.length < AI_LIMITS.errorSamples) result.issues.push({ code, file: name, row, column, reason, fix });
  };
  if (!/\.csv$/i.test(name) || !bytes.length || bytes.length > AI_LIMITS.fileBytes) {
    issue('INVALID_FORMAT', 0, '', 'Chỉ nhận CSV không rỗng, tối đa 10 MB.', 'Lưu thành CSV UTF-8 và chia nhỏ file nếu cần.'); return result;
  }
  let records: { record: string[]; info: { lines: number } }[];
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('Binary content');
    records = parse(text, { bom: true, skip_empty_lines: true, info: true, relax_column_count: true, max_record_size: 65536 }) as unknown as typeof records;
  } catch {
    issue('INVALID_FORMAT', 0, '', 'Không đọc được CSV UTF-8 có dấu phẩy phân cách.', 'Kiểm tra mã hóa, dấu ngoặc kép và dấu phân cách.'); return result;
  }
  const header = records.shift();
  if (!header || !records.length || records.length > AI_LIMITS.rows || header.record.length > 40 || new Set(header.record).size !== header.record.length || header.record.some(c => !c.trim() || c.length > 100)) {
    issue('INVALID_FORMAT', 1, '', 'Cần tiêu đề duy nhất, tối đa 40 cột và 1–400.000 dòng.', 'Sửa tiêu đề, bỏ cột rỗng hoặc chia nhỏ file.'); return result;
  }
  result.columns = header.record; result.totalRows = records.length;
  const suggested: Mapping = {};
  for (const [target, names] of Object.entries(aliases)) {
    const candidates = header.record.filter(c => names.includes(normalizeHeader(c)));
    if (candidates.length === 1) suggested[target] = candidates[0]!;
  }
  const stock = header.record.some(c => /quantity_on_hand|stock_quantity|ton_kho|lot_number|received_date/.test(normalizeHeader(c)));
  const salesEvidence = ['date','store_id','product_id','quantity'].filter(c => suggested[c]).length;
  const productEvidence = ['product_id','name','unit_code'].filter(c => suggested[c]).length;
  result.kind = requestedKind ?? (stock && salesEvidence >= 2 ? 'INVENTORY' : salesEvidence >= 3 ? 'SALES' : productEvidence >= 2 && suggested.name ? 'PRODUCTS' : salesEvidence >= 2 ? 'SALES' : null);
  if (!result.kind) {
    result.status = 'UNSUPPORTED_DATASET'; issue(result.status, 1, '', 'Không nhận diện được cấu trúc bán hàng, sản phẩm hoặc tồn đầu kỳ.', 'Dùng file bán lẻ thuộc một nhóm hỗ trợ; xem mẫu CSV.'); return result;
  }
  const definition = DATA_FIELDS[result.kind];
  const allowed = [...definition.required, ...definition.optional];
  result.mapping = supplied ?? Object.fromEntries(Object.entries(suggested).filter(([key]) => allowed.includes(key)));
  if (Object.entries(result.mapping).some(([key, value]) => !allowed.includes(key) || !header.record.includes(value)) || new Set(Object.values(result.mapping)).size !== Object.values(result.mapping).length) {
    issue('INVALID_FORMAT', 1, '', 'Mapping có cột không tồn tại hoặc một cột nguồn được dùng nhiều lần.', 'Chọn lại cột nguồn duy nhất cho mỗi trường.'); return result;
  }
  result.ignoredColumns = header.record.filter(c => !Object.values(result.mapping).includes(c));
  for (const column of definition.required) if (!result.mapping[column]) issue('MISSING_REQUIRED_FIELDS', 1, column, `Thiếu trường ${column}.`, `Ánh xạ cột tương ứng hoặc bổ sung ${column} vào CSV.`);
  if (result.issueCount) { result.status = 'MISSING_REQUIRED_FIELDS'; return result; }
  if (!supplied && (result.ignoredColumns.length || Object.entries(result.mapping).some(([key, value]) => key !== value))) {
    result.status = 'NEEDS_MAPPING'; issue(result.status, 1, '', 'Cần xác nhận tên cột tương ứng và các cột không sử dụng.', 'Xem và xác nhận mapping. File gốc được giữ nguyên.');
    result.sample = records.slice(0, 5).map(r => ({ row: r.info.lines, values: Object.fromEntries(header.record.map((c, i) => [c, r.record[i] ?? ''])) }));
    return result;
  }
  const seen = new Set<string>();
  for (const record of records) {
    const row = record.info.lines; const values: Record<string, string> = {};
    if (record.record.length !== header.record.length) { issue('INVALID_FORMAT', row, '', 'Số ô không khớp tiêu đề.', 'Kiểm tra dấu phẩy và ngoặc kép của dòng.'); continue; }
    for (const [key, column] of Object.entries(result.mapping)) values[key] = record.record[header.record.indexOf(column)] ?? '';
    for (const column of definition.required) if (!values[column]?.trim()) issue('MISSING_REQUIRED_FIELDS', row, column, 'Ô bắt buộc đang trống.', 'Bổ sung giá trị từ dữ liệu nguồn; không đoán hoặc tự điền 0.');
    for (const [column, value] of Object.entries(values)) {
      if (value.length > (column === 'name' ? 200 : 100) || value !== value.trim() || [...value].some(c => c.charCodeAt(0) < 32)) issue('INVALID_FORMAT', row, column, 'Giá trị quá dài hoặc có khoảng trắng/ký tự điều khiển không hợp lệ.', 'Sửa giá trị trong file hoặc tạo bản CSV sạch có đối chiếu.');
      if (['store_id','product_id','unit_code','transaction_id','line_id','lot_number','name'].includes(column) && /^[=+@-]/.test(value)) issue('INVALID_FORMAT', row, column, 'Giá trị bắt đầu bằng ký hiệu công thức không được hỗ trợ.', 'Sử dụng mã/tên dạng văn bản thông thường.');
    }
    if (values.date && (!/^\d{4}-\d{2}-\d{2}$/.test(values.date) || !Number.isFinite(Date.parse(values.date)) || new Date(values.date).toISOString().slice(0, 10) !== values.date)) issue('INVALID_FORMAT', row, 'date', 'Ngày không hợp lệ.', 'Dùng ngày thực tế dạng YYYY-MM-DD.');
    if (values.quantity !== undefined && (!/^\d+(\.\d{1,4})?$/.test(values.quantity) || Number(values.quantity) >= 10_000_000_000)) issue('INVALID_FORMAT', row, 'quantity', 'Số lượng phải không âm, tối đa 4 chữ số thập phân và nhỏ hơn 10 tỷ.', 'Dùng số lượng theo đơn vị cơ sở, dấu chấm thập phân; không dùng doanh thu thay số lượng.');
    const key = result.kind === 'PRODUCTS' ? [values.store_id, values.product_id] : result.kind === 'INVENTORY' ? [values.store_id, values.product_id, values.date, values.lot_number] : values.transaction_id ? [values.store_id, values.transaction_id, values.line_id || values.product_id] : [values.store_id, values.product_id, values.date];
    if (seen.has(JSON.stringify(key))) issue('DUPLICATE_DATA', row, '', 'Khóa bản ghi trùng trong file.', 'Đối chiếu nguồn rồi sửa/xóa bản trùng; dòng hóa đơn lặp sản phẩm cần line_id riêng.');
    seen.add(JSON.stringify(key)); result.rows.push({ row, values });
  }
  result.status = result.issueCount ? result.issues[0]!.code : 'VALID';
  result.sample = result.rows.slice(0, 20); return result;
}
