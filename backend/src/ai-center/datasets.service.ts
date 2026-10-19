import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type AiDataset } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { bodyObject, requiredText, uuidValue } from '../common/validation';
import { addDays } from '../inventory/expiry';
import { ForecastHistory, coveredDate } from '../forecasts/forecast-history';
import { DEMO_SOURCE } from '../forecasts/demo-source';
import { writeActor } from '../common/operations';
import { AI_LIMITS, AiStorage, aiError, audit, checkScope, hashBytes, jsonValue } from './ai-core';
import { DATA_FIELDS, type DataKind, type DataIssue, type DataRow, type Mapping, validateCsv, snapshotCsv } from './dataset-validation';

type CheckedRow = DataRow & { file: string; fileId: string; kind: DataKind };
type Summary = { valid: boolean; issueCount: number; issues: DataIssue[]; rows: number; salesRows: number; stores: number; products: number;
  series: number; start: string | null; end: string | null; zeroDays: number; missingDays: number; synthetic: boolean;
  transformations: string[]; fingerprint: string; units: string[]; minimumTrainingDays: number; pairs: { store: string; product: string; days: number; start: string; end: string; missing: number }[] };
const locked = new Set<string>();
@Injectable()
export class DatasetsService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;
  constructor(private readonly db: PrismaService, private readonly storage: AiStorage, private readonly history: ForecastHistory) {}
  async onModuleInit() { await this.cleanup(); this.cleanupTimer = setInterval(() => { void this.cleanup().catch(() => undefined); }, 3600000); this.cleanupTimer.unref(); }
  onModuleDestroy() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); }
  async cleanup() {
    const expired = await this.db.aiDataset.findMany({ where: { status: { in: ['STAGING', 'EXPIRED'] }, expiresAt: { lt: new Date() } } });
    for (const row of expired) {
      if (locked.has(row.id)) continue;
      await this.exclusive(row.id, async () => {
        const changed = await this.db.aiDataset.updateMany({ where: { id: row.id, status: 'STAGING', revision: row.revision }, data: { status: 'EXPIRED', revision: { increment: 1 } } });
        if (changed.count || row.status === 'EXPIRED') {
          await this.storage.clearStaging(row.id);
          if (!changed.count) return;
          await audit(this.db, row.ownerId, 'DATASET_EXPIRED', row.id, { removedStagingFiles: true });
        }
      }).catch(() => undefined);
    }
  }
  private async exclusive<T>(id: string, action: () => Promise<T>): Promise<T> {
    if (locked.has(id)) aiError('CONFLICT', 'Dataset đang được xử lý. Vui lòng chờ.', 409);
    locked.add(id);
    try {
      // Hold a database advisory lock for the whole filesystem/metadata operation,
      // including across backend processes. Business tables are never locked.
      return await this.db.$transaction(async tx => {
        const [guard] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`ai-dataset:${id}`}, 0)) AS acquired`;
        if (!guard?.acquired) aiError('CONFLICT', 'Dataset đang được xử lý. Vui lòng chờ.', 409);
        return action();
      }, { timeout: 180000 });
    } finally { locked.delete(id); }
  }
  async get(id: string, user: AuthenticatedUser, mutable = false) {
    const row = await this.db.aiDataset.findUnique({ where: { id: uuidValue(id) } });
    if (!row) aiError('NOT_FOUND', 'Không tìm thấy dataset.', 404);
    checkScope(user, row.locationId, row.ownerId, row.external);
    if (mutable && (row.status !== 'STAGING' || row.expiresAt <= new Date())) aiError('CONFLICT', 'Dataset đã công bố hoặc staging đã hết hạn.', 409);
    return row;
  }
  async list(user: AuthenticatedUser) {
    await this.cleanup();
    return { items: await this.db.aiDataset.findMany({ where: user.role === 'ADMIN' ? {} : { ownerId: user.id, locationId: user.locationId, external: false }, orderBy: { createdAt: 'desc' }, take: 30 }) };
  }
  async detail(id: string, user: AuthenticatedUser) {
    const row = await this.get(id, user);
    const files = await this.db.aiDatasetFile.findMany({ where: { datasetId: row.id, removed: false }, orderBy: { createdAt: 'asc' } });
    return { ...row, files, limits: AI_LIMITS };
  }
  async create(input: unknown, user: AuthenticatedUser) {
    await this.cleanup();
    const body = bodyObject(input, ['name', 'locationId', 'external', 'synthetic', 'sourceKind']);
    const name = requiredText(body.name, 'Tên dataset', 150);
    if (body.external !== undefined && typeof body.external !== 'boolean' || body.synthetic !== undefined && typeof body.synthetic !== 'boolean') aiError('INVALID_FORMAT', 'Chọn nguồn dữ liệu hợp lệ.');
    const external = body.external === true, synthetic = body.synthetic === true;
    const locationId = body.locationId ? uuidValue(body.locationId) : user.role === 'STORE_MANAGER' ? user.locationId : null;
    checkScope(user, locationId, user.id, external);
    if (external && locationId) aiError('INVALID_FORMAT', 'Dataset ngoài hệ thống không gắn với cửa hàng nghiệp vụ.');
    if (locationId && !await this.db.location.findFirst({ where: { id: locationId, locationType: 'STORE', isActive: true, deletedAt: null } })) aiError('ACCESS_DENIED', 'Cửa hàng không khả dụng.', 403);
    const sourceKind = body.sourceKind ?? 'CSV';
    if (!['CSV','DATABASE'].includes(String(sourceKind)) || external && sourceKind !== 'CSV') aiError('INVALID_FORMAT', 'Nguồn dữ liệu không hợp lệ.');
    if (await this.db.aiDataset.count({ where: { ownerId: user.id, status: 'STAGING' } }) >= AI_LIMITS.datasetsPerUser) aiError('RESOURCE_LIMIT', 'Tối đa 10 batch đang chờ. Hãy công bố hoặc hủy một batch.');
    const row = await this.db.aiDataset.create({ data: { ownerId: user.id, locationId, name, external, synthetic, sourceKind: String(sourceKind), expiresAt: new Date(Date.now() + AI_LIMITS.stagingDays * 86400000) } });
    await audit(this.db, user.id, 'DATASET_CREATED', row.id, { sourceKind, locationId, external, synthetic });
    if (sourceKind === 'DATABASE') {
      try { await this.databaseSnapshot(row, user); } catch (error) {
        await this.db.aiDataset.update({ where: { id: row.id }, data: { status: 'EXPIRED' } }); throw error;
      }
    }
    return this.detail(row.id, user);
  }
  private async databaseSnapshot(dataset: AiDataset, user: AuthenticatedUser) {
    const source = await this.history.snapshot(dataset.locationId ?? undefined);
    const rows: Record<string, string>[] = [];
    for (const pair of source.pairs) {
      if (!pair.locationId || !pair.productId) continue;
      const coverage = source.coverage.filter(c => c.locationId === pair.locationId && c.productId === pair.productId);
      const first = coverage.map(c => c.periodStart.toISOString().slice(0, 10)).sort()[0];
      if (!first) continue;
      const values = new Map(source.daily.filter(d => d.locationId === pair.locationId && d.productId === pair.productId).map(d => [d.date, d]));
      for (let date = first; date <= source.origin; date = addDays(date, 1)) {
        if (!coveredDate(coverage, date)) continue;
        const synthetic = values.get(date)?.synthetic === true || pair.product?.externalSource === DEMO_SOURCE || pair.location?.externalSource === DEMO_SOURCE || coverage.some(c => c.source === 'SYNTHETIC' && coveredDate([c], date));
        if (synthetic && !dataset.synthetic) continue;
        rows.push({ date, store_id: pair.locationId, product_id: pair.productId, quantity: String(values.get(date)?.quantity ?? 0), unit_code: pair.product?.baseUnit?.code ?? '', source: synthetic ? 'SYNTHETIC' : 'STORE_HISTORY' });
        if (rows.length > AI_LIMITS.rows) aiError('RESOURCE_LIMIT', 'Chọn phạm vi nhỏ hơn: snapshot vượt 400.000 dòng.');
      }
    }
    if (!rows.length) aiError('MISSING_REQUIRED_FIELDS', 'Chưa có lịch sử đã xác nhận phù hợp. Dữ liệu mô phỏng bị loại mặc định.');
    const bytes = Buffer.from(snapshotCsv(rows));
    if (bytes.length > AI_LIMITS.fileBytes) aiError('RESOURCE_LIMIT', 'Snapshot vượt 10 MB. Chọn một cửa hàng.');
    await this.addFile(dataset, 'database-snapshot.csv', bytes, user);
  }
  async upload(id: string, files: Express.Multer.File[] | undefined, user: AuthenticatedUser) {
    return this.exclusive(uuidValue(id), async () => {
      const row = await this.get(id, user, true);
      if (row.sourceKind !== 'CSV') aiError('CONFLICT', 'Snapshot database không nhận thêm CSV; tạo batch riêng để tránh trộn nguồn.', 409);
      if (!files?.length || files.length > AI_LIMITS.files) aiError('INVALID_FORMAT', 'Chọn từ 1 đến 20 file CSV.');
      const current = await this.db.aiDatasetFile.aggregate({ where: { datasetId: id, removed: false }, _sum: { bytes: true }, _count: true });
      if (current._count + files.length > AI_LIMITS.files || (current._sum.bytes ?? 0) + files.reduce((n, f) => n + f.size, 0) > AI_LIMITS.batchBytes) aiError('RESOURCE_LIMIT', 'Mỗi batch tối đa 20 file và 100 MB.');
      for (const file of files) await this.addFile(row, file.originalname, file.buffer, user);
      return this.detail(id, user);
    });
  }
  private async addFile(dataset: AiDataset, originalName: string, bytes: Buffer, user: AuthenticatedUser, replacedId?: string) {
    const name = requiredText(originalName, 'Tên file', 255).replace(/[\\/]/g, '_');
    const id = randomUUID(); const checked = validateCsv(name, bytes);
    const fingerprint = hashBytes(bytes);
    if (await this.db.aiDatasetFile.count({ where: { datasetId: dataset.id, sha256: fingerprint, removed: false, ...(replacedId ? { id: { not: replacedId } } : {}) } })) {
      checked.status = 'DUPLICATE_DATA'; checked.issueCount++; checked.issues.unshift({ code: 'DUPLICATE_DATA', file: name, row: 0, column: '', reason: 'Nội dung file trùng file đã chọn trong batch.', fix: 'Loại bỏ một file trùng trước khi công bố.' });
    }
    if (bytes.length > AI_LIMITS.fileBytes) aiError('RESOURCE_LIMIT', 'File vượt 10 MB.');
    const usage = await this.db.aiDatasetFile.aggregate({ where: { dataset: { ownerId: user.id, status: { in: ['STAGING','PUBLISHED'] } }, removed: false }, _sum: { bytes: true } });
    if ((usage._sum.bytes ?? 0) + bytes.length > 500 * 1024 * 1024) aiError('RESOURCE_LIMIT', 'Tài khoản đã đạt 500 MB file nguồn đang lưu. Hủy staging không cần thiết hoặc liên hệ quản trị viên.');
    await this.storage.write(dataset.id, id + '.csv', bytes);
    try {
      await this.db.$transaction(async tx => {
        await tx.aiDatasetFile.create({ data: { id, datasetId: dataset.id, name, bytes: bytes.length, sha256: fingerprint, ...this.fileResult(checked) } });
        if (replacedId) await tx.aiDatasetFile.update({ where: { id: replacedId }, data: { removed: true } });
        await tx.aiDataset.update({ where: { id: dataset.id }, data: { revision: { increment: 1 }, summary: Prisma.DbNull } });
        await audit(tx, user.id, 'FILE_STAGED', id, { datasetId: dataset.id, name, sha256: fingerprint, status: checked.status, rows: checked.totalRows });
      });
    } catch (error) { await this.storage.remove(dataset.id, id + '.csv'); throw error; }
  }
  private fileResult(checked: ReturnType<typeof validateCsv>) {
    return { rows: checked.totalRows, kind: checked.kind, status: checked.status, mapping: jsonValue(checked.mapping),
      profile: jsonValue({ columns: checked.columns, ignoredColumns: checked.ignoredColumns, sample: checked.sample, issueCount: checked.issueCount }), issues: jsonValue(checked.issues) };
  }
  async mapFile(id: string, fileId: string, input: unknown, user: AuthenticatedUser) {
    return this.exclusive(uuidValue(id), async () => {
      const dataset = await this.get(id, user, true); const body = bodyObject(input, ['kind', 'mapping']);
      if (!Object.hasOwn(DATA_FIELDS, String(body.kind))) aiError('UNSUPPORTED_DATASET', 'Chọn nhóm dữ liệu được hỗ trợ.');
      if (!body.mapping || typeof body.mapping !== 'object' || Array.isArray(body.mapping) || Object.values(body.mapping).some(v => typeof v !== 'string')) aiError('INVALID_FORMAT', 'Mapping phải là tên cột nguồn cho từng trường.');
      const file = await this.db.aiDatasetFile.findFirst({ where: { id: uuidValue(fileId), datasetId: dataset.id, removed: false } });
      if (!file) aiError('NOT_FOUND', 'Không tìm thấy file trong batch.', 404);
      const bytes = await this.storage.read(id, file.id + '.csv', AI_LIMITS.fileBytes);
      if (hashBytes(bytes) !== file.sha256) aiError('INVALID_FORMAT', 'File staging đã thay đổi. Hãy thay thế file.');
      const checked = validateCsv(file.name, bytes, body.kind as DataKind, body.mapping as Mapping);
      await this.db.$transaction(async tx => {
        await tx.aiDatasetFile.update({ where: { id: file.id }, data: this.fileResult(checked) });
        await tx.aiDataset.update({ where: { id }, data: { revision: { increment: 1 }, summary: Prisma.DbNull } });
        await audit(tx, user.id, 'MAPPING_CONFIRMED', file.id, { datasetId: id, mapping: checked.mapping, ignoredColumns: checked.ignoredColumns, status: checked.status });
      });
      return this.detail(id, user);
    });
  }
  async removeFile(id: string, fileId: string, user: AuthenticatedUser) {
    return this.exclusive(uuidValue(id), async () => {
      await this.get(id, user, true);
      await this.db.$transaction(async tx => {
        if (!(await tx.aiDatasetFile.updateMany({ where: { id: uuidValue(fileId), datasetId: id, removed: false }, data: { removed: true } })).count) aiError('NOT_FOUND', 'Không tìm thấy file.', 404);
        await tx.aiDataset.update({ where: { id }, data: { revision: { increment: 1 }, summary: Prisma.DbNull } });
        await audit(tx, user.id, 'FILE_REMOVED', fileId, { datasetId: id });
      });
      await this.storage.remove(id, fileId + '.csv');
      return this.detail(id, user);
    });
  }
  async replaceFile(id: string, fileId: string, files: Express.Multer.File[] | undefined, user: AuthenticatedUser) {
    return this.exclusive(uuidValue(id), async () => {
      const dataset = await this.get(id, user, true);
      const old = await this.db.aiDatasetFile.findFirst({ where: { id: uuidValue(fileId), datasetId: id, removed: false } });
      if (!old || files?.length !== 1 || dataset.sourceKind !== 'CSV') aiError('INVALID_FORMAT', 'Chọn một file thay thế cho file đang staging.');
      const usage = await this.db.aiDatasetFile.aggregate({ where: { datasetId: id, removed: false }, _sum: { bytes: true } });
      if ((usage._sum.bytes ?? 0) - old.bytes + files[0]!.size > AI_LIMITS.batchBytes) aiError('RESOURCE_LIMIT', 'Batch vượt 100 MB.');
      await this.addFile(dataset, files[0]!.originalname, files[0]!.buffer, user, old.id);
      await this.storage.remove(id, old.id + '.csv');
      await audit(this.db, user.id, 'FILE_REPLACED', old.id, { datasetId: id });
      return this.detail(id, user);
    });
  }
  async discard(id: string, user: AuthenticatedUser) {
    return this.exclusive(uuidValue(id), async () => {
      await this.get(id, user, true);
      await this.db.aiDataset.update({ where: { id }, data: { status: 'EXPIRED', revision: { increment: 1 } } });
      await this.storage.clearStaging(id); await audit(this.db, user.id, 'DATASET_DISCARDED', id);
      return this.detail(id, user);
    });
  }
  private async build(dataset: AiDataset, user: AuthenticatedUser): Promise<{ summary: Summary; csv: string }> {
    const files = await this.db.aiDatasetFile.findMany({ where: { datasetId: dataset.id, removed: false }, orderBy: { createdAt: 'asc' } });
    const issues: DataIssue[] = []; let issueCount = 0;
    const issue = (code: string, file: string, row: number, column: string, reason: string, fix: string) => { issueCount++; if (issues.length < AI_LIMITS.errorSamples) issues.push({ code, file, row, column, reason, fix }); };
    const all: CheckedRow[] = []; const hashes = new Set<string>(); let sourceRows = 0;
    for (const file of files) {
      if (hashes.has(file.sha256)) { issue('DUPLICATE_DATA', file.name, 0, '', 'File trùng nội dung trong batch.', 'Loại bỏ một file trùng.'); continue; }
      hashes.add(file.sha256);
      if (!['VALID','DUPLICATE_DATA'].includes(file.status)) { issue(file.status, file.name, 0, '', 'File chưa vượt qua kiểm tra.', 'Sửa mapping, thay thế hoặc loại bỏ file.'); continue; }
      const bytes = await this.storage.read(dataset.id, file.id + '.csv', AI_LIMITS.fileBytes);
      if (hashBytes(bytes) !== file.sha256) { issue('INVALID_FORMAT', file.name, 0, '', 'Checksum staging không khớp.', 'Thay thế file từ nguồn tin cậy.'); continue; }
      const checked = validateCsv(file.name, bytes, file.kind as DataKind, file.mapping as Mapping);
      if (checked.status !== 'VALID') { for (const e of checked.issues) issue(e.code, e.file, e.row, e.column, e.reason, e.fix); continue; }
      sourceRows += checked.totalRows;
      if (sourceRows > AI_LIMITS.rows) { issue('RESOURCE_LIMIT', file.name, 0, '', 'Batch vượt 400.000 dòng.', 'Chia thành những dataset có phạm vi riêng.'); break; }
      for (const r of checked.rows) all.push({ ...r, file: file.name, fileId: file.id, kind: checked.kind! });
      if (file.status !== 'VALID') await this.db.aiDatasetFile.update({ where: { id: file.id }, data: this.fileResult(checked) });
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    const locations = dataset.external ? [] : await this.db.location.findMany({ where: { deletedAt: null, locationType: 'STORE', ...(dataset.locationId ? { id: dataset.locationId } : {}) }, select: { id: true, code: true, externalSource: true } });
    const products = dataset.external ? [] : await this.db.product.findMany({ where: { deletedAt: null, ...(user.role === 'STORE_MANAGER' ? { storeProducts: { some: { locationId: user.locationId } } } : {}) }, include: { baseUnit: true } });
    const locationMap = new Map(locations.flatMap(l => [[l.id, l], [l.code, l]] as const));
    const productMap = new Map(products.flatMap(p => [[p.id, p], [p.sku, p]] as const));
    const keys = new Set<string>(), units = new Map<string, string>(), productsSeen = new Set<string>(), catalogs = new Set<string>();
    const sales = new Map<string, { values: Record<string, string>; amount: Prisma.Decimal; mode: string }>();
    let synthetic = dataset.synthetic; let sourceSalesRows = 0;
    for (let i = 0; i < all.length; i++) {
      const row = all[i]!; const v = { ...row.values };
      const bad = (code: string, column: string, reason: string, fix: string) => issue(code, row.file, row.row, column, reason, fix);
      if (!dataset.external) {
        const location = v.store_id ? locationMap.get(v.store_id) : null, product = productMap.get(v.product_id!);
        if (v.store_id && !location) { bad('ACCESS_DENIED', 'store_id', 'Mã cửa hàng không thuộc phạm vi được phép.', 'Chọn dữ liệu của cửa hàng được giao hoặc nhờ ADMIN kiểm tra.'); continue; }
        if (!product || product.baseUnit?.code !== v.unit_code) { bad('MISSING_REQUIRED_FIELDS', 'product_id', 'Sản phẩm hoặc đơn vị cơ sở không khớp cấu hình được phép.', 'Dùng mã/UUID sản phẩm và đúng đơn vị cơ sở.'); continue; }
        if (location) v.store_id = location.id; v.product_id = product.id;
        synthetic ||= product.externalSource === DEMO_SOURCE || location?.externalSource === DEMO_SOURCE;
      }
      synthetic ||= /SYNTHETIC|DEMO/i.test(v.source ?? '');
      const productKey = v.product_id!;
      if (units.has(productKey) && units.get(productKey) !== v.unit_code) bad('INVALID_FORMAT', 'unit_code', 'Cùng sản phẩm có đơn vị không nhất quán giữa các file.', 'Quy đổi có đối chiếu trước khi nhập; không cộng kg với cái.');
      units.set(productKey, v.unit_code!); productsSeen.add(productKey);
      const key = JSON.stringify(row.kind === 'SALES' ? (v.transaction_id ? ['txn', v.store_id, v.transaction_id, v.line_id || v.product_id] : ['daily', v.store_id, v.product_id, v.date]) : row.kind === 'PRODUCTS' ? ['product', v.store_id, v.product_id] : ['inventory', v.store_id, v.product_id, v.date, v.lot_number]);
      if (keys.has(key)) { bad('DUPLICATE_DATA', '', 'Bản ghi trùng hoặc xung đột giữa các file.', 'Sửa file nguồn hoặc loại bỏ file trùng rồi kiểm tra lại.'); continue; }
      keys.add(key);
      if (row.kind === 'PRODUCTS') catalogs.add(productKey);
      if (row.kind === 'SALES') {
        sourceSalesRows++;
        const dailyKey = JSON.stringify([v.store_id, v.product_id, v.date]); const mode = v.transaction_id ? 'transaction' : 'daily';
        const existing = sales.get(dailyKey);
        if (existing && (mode === 'daily' || existing.mode === 'daily')) bad('DUPLICATE_DATA', '', 'Ngày bán có cả bản tổng hợp và bản chi tiết hoặc nhiều bản tổng hợp.', 'Chọn một nguồn cho cùng cửa hàng/sản phẩm/ngày; không cộng hai lần.');
        else sales.set(dailyKey, { values: v, amount: (existing?.amount ?? new Prisma.Decimal(0)).add(v.quantity!), mode });
      }
      if (i % 2000 === 0) await new Promise<void>(resolve => setImmediate(resolve));
    }
    if (!sales.size) issue('MISSING_REQUIRED_FIELDS', '', 0, 'SALES', 'Dataset chưa có lịch sử bán hàng hợp lệ.', 'Thêm Sales History; catalog và tồn đầu kỳ không thay thế số lượng bán.');
    if (catalogs.size) for (const sale of sales.values()) if (!catalogs.has(sale.values.product_id!)) issue('MISSING_REQUIRED_FIELDS', '', 0, 'product_id', 'Sản phẩm bán hàng chưa có trong catalog đã chọn.', 'Bổ sung sản phẩm vào catalog hoặc loại bỏ catalog không đầy đủ.');
    if (dataset.external && catalogs.size) for (const row of all) if (row.kind === 'INVENTORY' && !catalogs.has(row.values.product_id!)) issue('MISSING_REQUIRED_FIELDS', row.file, row.row, 'product_id', 'Sản phẩm tồn đầu kỳ chưa có trong catalog đã chọn.', 'Bổ sung catalog đầy đủ hoặc loại bỏ file catalog.');
    const timeline = new Map<string, string[]>();
    const finalRows = [...sales.values()].map(({ values, amount }) => {
      if (amount.gte(10_000_000_000)) issue('INVALID_FORMAT', '', 0, 'quantity', 'Tổng lượng bán/ngày vượt giới hạn.', 'Kiểm tra đơn vị và dòng giao dịch trùng.');
      const key = JSON.stringify([values.store_id, values.product_id]);
      const dates = timeline.get(key) ?? []; dates.push(values.date!); timeline.set(key, dates);
      return { date: values.date!, store_id: values.store_id!, product_id: values.product_id!, quantity: amount.toString(), unit_code: values.unit_code!,
        source: synthetic ? 'SYNTHETIC' : dataset.sourceKind === 'DATABASE' ? 'STORE_HISTORY' : dataset.external ? 'EXTERNAL_CSV' : 'STORE_CSV' };
    }).sort((a, b) => a.store_id.localeCompare(b.store_id) || a.product_id.localeCompare(b.product_id) || a.date.localeCompare(b.date));
    const pairs = [...timeline.entries()].map(([key, dates]) => { dates.sort(); const [store, product] = JSON.parse(key) as [string, string];
      return { store, product, days: dates.length, start: dates[0]!, end: dates.at(-1)!, missing: Math.round((Date.parse(dates.at(-1)!) - Date.parse(dates[0]!)) / 86400000) + 1 - dates.length }; });
    const dateList = finalRows.map(r => r.date).sort();
    const csv = snapshotCsv(finalRows);
    const summary: Summary = { valid: !issueCount, issueCount, issues, rows: sourceRows, salesRows: finalRows.length, stores: new Set(finalRows.map(r => r.store_id)).size,
      products: productsSeen.size, series: pairs.length, start: dateList[0] ?? null, end: dateList.at(-1) ?? null, zeroDays: finalRows.filter(r => Number(r.quantity) === 0).length,
      missingDays: pairs.reduce((n, p) => n + p.missing, 0), synthetic, fingerprint: hashBytes(csv), units: [...new Set(finalRows.map(r => r.unit_code))],
      minimumTrainingDays: pairs.length ? pairs.reduce((minimum,p) => Math.min(minimum,p.days), Infinity) : 0, pairs: pairs.slice(0, 1000),
      transformations: [`${sourceSalesRows} dòng bán hàng → ${finalRows.length} tổng ngày theo đơn vị cơ sở.`, 'Ngày không có dữ liệu vẫn là chưa biết; không tự điền 0.',
        dataset.external ? 'Giữ nguyên mã ngoài hệ thống, không tạo bản ghi nghiệp vụ.' : 'Đối chiếu mã với UUID và đơn vị cơ sở của database.',
        'Danh mục/tồn đầu kỳ chỉ phục vụ đối chiếu và phân tích; không dùng tồn tương lai làm feature.', `Nguồn snapshot: ${synthetic ? 'SYNTHETIC (không được kích hoạt)' : dataset.sourceKind === 'DATABASE' ? 'STORE_HISTORY' : 'CSV — nguồn do người dùng cung cấp'}.`] };
    return { summary, csv };
  }
  async validate(id: string, user: AuthenticatedUser) {
    return this.exclusive(uuidValue(id), async () => {
      const dataset = await this.get(id, user, true); const { summary } = await this.build(dataset, user);
      if (!(await this.db.aiDataset.updateMany({ where: { id, revision: dataset.revision, status: 'STAGING' }, data: { summary: jsonValue(summary) } })).count) aiError('CONFLICT', 'Batch đã thay đổi. Kiểm tra lại.', 409);
      await audit(this.db, user.id, 'DATASET_VALIDATED', id, { revision: dataset.revision, valid: summary.valid, issueCount: summary.issueCount, fingerprint: summary.fingerprint });
      return this.detail(id, user);
    });
  }
  async publish(id: string, input: unknown, user: AuthenticatedUser) {
    return this.exclusive(uuidValue(id), async () => {
      const dataset = await this.get(id, user, true); const body = bodyObject(input, ['revision', 'fingerprint', 'confirmed']);
      const reviewed = dataset.summary as Summary | null;
      if (body.confirmed !== true || body.revision !== dataset.revision || !reviewed?.valid || body.fingerprint !== reviewed.fingerprint) aiError('CONFLICT', 'Kiểm tra toàn bộ batch và xác nhận bản đang xem trước khi công bố.', 409);
      const { summary, csv } = await this.build(dataset, user);
      if (!summary.valid || summary.fingerprint !== reviewed.fingerprint) aiError('CONFLICT', 'Dữ liệu/quyền đã thay đổi hoặc còn lỗi. Kiểm tra lại batch.', 409);
      const artifact = `snapshot-${dataset.revision}.csv`;
      await this.storage.write(id, artifact, csv);
      try {
        await this.db.$transaction(async tx => {
          const actor = await writeActor(tx, user); checkScope({ ...user, ...actor }, dataset.locationId, dataset.ownerId, dataset.external);
          const changed = await tx.aiDataset.updateMany({ where: { id, revision: dataset.revision, status: 'STAGING' }, data: { status: 'PUBLISHED', synthetic: summary.synthetic, snapshotHash: summary.fingerprint, summary: jsonValue(summary), publishedAt: new Date() } });
          if (!changed.count) aiError('CONFLICT', 'Batch đã thay đổi. Không công bố bản cũ.', 409);
          await audit(tx, user.id, 'DATASET_PUBLISHED', id, { revision: dataset.revision, sha256: summary.fingerprint, transformations: summary.transformations });
        }, { isolationLevel: 'Serializable' });
      } catch (error) { await this.storage.remove(id, artifact); throw error; }
      return this.detail(id, user);
    });
  }
}
