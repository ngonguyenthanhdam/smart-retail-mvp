import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { Workbook } from 'exceljs';
import { unzipSync } from 'fflate';

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 1000;
export const importTypes = ['PRODUCT', 'SALE', 'INVENTORY', 'PURCHASE', 'EXPENSE'] as const;
export type ImportType = typeof importTypes[number];
export type SourceRow = { row: number; values: Record<string, string>; error?: string };
export type SourceFile = { columns: string[]; rows: SourceRow[] };
export type RowError = { row: number; error: string };
export const templates: Record<ImportType, { columns: string[]; required: string[]; instructions: string }> = {
  PRODUCT: { columns: ['sku','barcode','name','category_code','base_unit_code','purchase_unit_code','purchase_to_base_ratio','default_cost','track_expiry','shelf_life_days','is_active'],
    required: ['sku','name','category_code','base_unit_code','purchase_unit_code'], instructions: 'New products only. Existing SKU/barcode is rejected. Ratio defaults to 1; cost to 0; track_expiry to false; is_active to true. Booleans: true/false.' },
  SALE: { columns: ['sale_reference','store_code','sale_date','product_sku','quantity','unit_price','discount_amount','cost_of_goods_sold'],
    required: ['sale_reference','store_code','sale_date','product_sku','quantity','unit_price','cost_of_goods_sold'], instructions: 'Historical completed sales only; no stock deduction. COGS is the total for each line. Repeat the same invoice discount on every line; applied once. Dates: YYYY-MM-DD or ISO timestamp with timezone. One invalid line rejects its entire invoice.' },
  INVENTORY: { columns: ['store_code','product_sku','lot_number','quantity_on_hand','unit_cost','received_date','expiry_date'],
    required: ['store_code','product_sku','lot_number','quantity_on_hand','unit_cost','received_date'], instructions: 'Opening stock in base units. Reject Store × Product pairs with existing lots, even zero-quantity lots. No overwrites. Multiple distinct new lots are allowed. Tracked products require expiry_date. Dates: YYYY-MM-DD; expired opening stock is allowed.' },
  PURCHASE: { columns: ['purchase_reference','location_code','ordered_at','received_at','status','product_sku','purchase_quantity','base_quantity','unit_cost','lot_number','expiry_date'],
    required: ['purchase_reference','location_code','ordered_at','status','product_sku','purchase_quantity','unit_cost'], instructions: 'Historical RECEIVED/CANCELLED only; no stock changes or live receiving. RECEIVED requires source base_quantity and received_at. CANCELLED may omit base_quantity (current ratio used for the cancelled line only). Cost is per purchase unit. One invalid line rejects the entire order.' },
  EXPENSE: { columns: ['expense_type','amount','expense_date','location_code','description'], required: ['expense_type','amount','expense_date'],
    instructions: 'Types: RENT, SALARY, ELECTRICITY, WATER, TRANSPORT, MARKETING, OTHER. Blank location_code means company-wide. Amount must be nonnegative. Date: YYYY-MM-DD.' },
};

export async function readImportFile(name: string, buffer: Buffer, type: ImportType): Promise<SourceFile> {
  if (!buffer.length || buffer.length > MAX_BYTES) throw new BadRequestException('Choose a nonempty CSV/XLSX file no larger than 2 MB.');
  const records: { row: number; cells: string[]; error?: string }[] = [];
  try {
    if (/\.csv$/i.test(name)) {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      const parsed = parse(text, { bom: true, skip_empty_lines: true, relax_column_count: true, info: true, max_record_size: 65536 }) as unknown as { record: string[]; info: { lines: number } }[];
      for (const entry of parsed) records.push({ row: entry.info.lines, cells: entry.record.map((cell) => cell.trim()) });
    } else if (/\.xlsx$/i.test(name)) {
      let expanded = 0; let entries = 0;
      unzipSync(buffer, { filter: (entry) => {
        expanded += entry.originalSize;
        if (++entries > 250 || expanded > 20 * 1024 * 1024) throw new Error('Workbook is too large when expanded.');
        return false;
      } });
      const book = new Workbook();
      await book.xlsx.load(buffer as unknown as Parameters<typeof book.xlsx.load>[0]);
      if (book.worksheets.length !== 1) throw new BadRequestException('Use exactly one worksheet per import file.');
      const sheet = book.worksheets[0]!;
      if (sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > 20) throw new BadRequestException('Use at most 1,000 data rows and 20 columns.');
      sheet.eachRow((row, number) => {
        const cells: string[] = []; let error: string | undefined;
        for (let i = 1; i <= sheet.columnCount; i++) {
          const value = row.getCell(i).value;
          if (value instanceof Date) cells.push(value.toISOString().slice(0, 10));
          else if (value == null) cells.push('');
          else if (['string','number','boolean'].includes(typeof value)) cells.push(String(value).trim());
          else { cells.push(''); error = 'Use literal cells; formulas, links and rich text are not supported.'; }
        }
        if (error || cells.some(Boolean)) records.push({ row: number, cells, error });
      });
    } else throw new BadRequestException('Only .csv and .xlsx files are supported.');
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('File cannot be read. Use a valid UTF-8 CSV or a small, unencrypted XLSX workbook.');
  }
  const header = records.shift();
  if (!header || header.error || !records.length || records.length > MAX_ROWS) throw new BadRequestException('Provide a header and between 1 and 1,000 data rows.');
  const columns = header.cells;
  const definition = templates[type];
  if (new Set(columns).size !== columns.length || columns.some((c) => !definition.columns.includes(c)) || definition.required.some((c) => !columns.includes(c))) {
    throw new BadRequestException('Headers must be unique supported column names and include every required column. Download the template.');
  }
  return { columns, rows: records.map(({ row, cells, error }) => ({ row,
    values: Object.fromEntries(columns.map((column, i) => [column, cells[i] ?? ''])),
    ...(error || cells.length !== columns.length ? { error: error ?? 'Column count does not match the header.' } : {}),
  })) };
}
