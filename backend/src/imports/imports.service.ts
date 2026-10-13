import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { bodyObject, choiceValue, listQuery, requiredText, uuidValue } from '../common/validation';
import { creatorSelect, writeActor } from '../common/operations';
import { databaseError } from '../common/database-errors';
import { importTypes, readImportFile, type ImportType, type SourceFile, templates } from './import-file';
import { ImportPlanner, type ImportPlan } from './import-plan';

const select = { id: true, importType: true, fileName: true, status: true, totalRows: true, successRows: true, failedRows: true, errorReport: true, createdAt: true, completedAt: true, creator: { select: creatorSelect } } as const;
const fingerprint = (plan: ImportPlan) => createHash('sha256').update(JSON.stringify(plan)).digest('hex');
type Preview = { type: ImportType; source: SourceFile; plan: ImportPlan; expiresAt: number; token: string };

@Injectable()
export class ImportsService {
  private readonly previews = new Map<string, Preview>();
  constructor(private readonly prisma: PrismaService, private readonly planner: ImportPlanner) {}
  definitions() { return { types: templates, maxBytes: 2 * 1024 * 1024, maxRows: 1000 }; }
  async list(input: unknown) {
    const { query, page, pageSize } = listQuery(input, ['importType']);
    const where = query.importType ? { importType: choiceValue(query.importType, importTypes, 'Import type') } : {};
    return this.prisma.$transaction(async (tx) => ({
      items: await tx.importJob.findMany({ where, select, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      total: await tx.importJob.count({ where }), page, pageSize,
    }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async detail(rawId: string) {
    const row = await this.prisma.importJob.findUnique({ where: { id: uuidValue(rawId) }, select });
    if (!row) throw new NotFoundException('Import job not found.');
    const preview = this.previews.get(row.id);
    return { ...row, ...(row.status === 'PENDING' && preview && preview.expiresAt > Date.now() ? this.previewData(preview) : {}),
      previewAvailable: row.status === 'PENDING' && !!preview && preview.expiresAt > Date.now() };
  }
  private previewData(preview: Preview) {
    const invalid = new Set(preview.plan.errors.map((e) => e.row));
    return { columns: preview.source.columns, validRows: preview.source.rows.length - invalid.size, invalidRows: invalid.size,
      sampleRows: preview.source.rows.slice(0, 20).map((row) => ({ row: row.row, values: row.values, valid: !invalid.has(row.row) })),
      expiresAt: new Date(preview.expiresAt).toISOString(), previewToken: preview.token };
  }
  private async requireAdmin(tx: Prisma.TransactionClient, user: AuthenticatedUser) {
    if ((await writeActor(tx, user)).role !== 'ADMIN') throw new ForbiddenException('Only administrators can import data.');
  }
  async upload(input: unknown, file: Express.Multer.File | undefined, user: AuthenticatedUser) {
    const body = bodyObject(input, ['importType']);
    const type = choiceValue(body.importType, importTypes, 'Import type') as ImportType;
    if (!file) throw new BadRequestException('Choose a file.');
    const name = requiredText(file.originalname, 'Filename', 255);
    const source = await readImportFile(name, file.buffer, type);
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    for (const [id, preview] of this.previews) if (preview.expiresAt <= Date.now()) this.previews.delete(id);
    if (this.previews.size >= 20) throw new BadRequestException('There are too many pending previews. Cancel a preview or wait for expiry.');
    try {
      const { job, plan } = await this.prisma.$transaction(async (tx) => {
        await this.requireAdmin(tx, user);
        const existing = await tx.importJob.findUnique({ where: { importType_fileHash: { importType: type, fileHash } } });
        if (existing && !['PENDING','FAILED'].includes(existing.status)) throw new ConflictException('This file has already been imported or is being processed.');
        const plan = await this.planner.prepare(tx, type, source);
        const data = { fileName: name, status: 'PENDING', totalRows: source.rows.length, successRows: 0, failedRows: 0,
          errorReport: plan.errors as Prisma.InputJsonValue, createdBy: user.id, createdAt: new Date(), completedAt: null };
        const job = existing ? await tx.importJob.update({ where: { id: existing.id }, data, select }) :
          await tx.importJob.create({ data: { ...data, importType: type, fileHash }, select });
        return { job, plan };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
      const preview = { type, source, plan, expiresAt: Date.now() + 30 * 60 * 1000, token: randomUUID() };
      this.previews.set(job.id, preview);
      return { ...job, ...this.previewData(preview), previewAvailable: true };
    } catch (error) { databaseError(error, 'This file is already being reviewed. Refresh import history.'); }
  }
  async confirm(rawId: string, input: unknown, user: AuthenticatedUser) {
    const body = bodyObject(input ?? {}, ['previewToken']); const id = uuidValue(rawId);
    const preview = this.previews.get(id);
    if (!preview || preview.expiresAt <= Date.now()) throw new ConflictException('Preview expired or unavailable. Upload the file again.');
    if (body.previewToken !== preview.token) throw new ConflictException('This preview has been replaced. Open the current preview from history before confirming.');
    if (!preview.plan.writes.length) throw new BadRequestException('No valid rows can be imported. Correct the file and upload again.');
    try {
      const job = await this.prisma.$transaction(async (tx) => {
        await this.requireAdmin(tx, user);
        const claimed = await tx.importJob.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'PROCESSING' } });
        if (claimed.count !== 1) throw new ConflictException('Import already completed or cancelled. Refresh history.');
        const plan = await this.planner.prepare(tx, preview.type, preview.source);
        if (fingerprint(plan) !== fingerprint(preview.plan)) throw new ConflictException('Data changed since preview. Upload the file again to review updated validation.');
        for (const write of plan.writes) await this.planner.apply(tx, write, user.id, id);
        const failedRows = new Set(plan.errors.map((e) => e.row)).size;
        return tx.importJob.update({ where: { id }, data: { status: failedRows ? 'PARTIAL' : 'COMPLETED', completedAt: new Date(),
          successRows: preview.source.rows.length - failedRows, failedRows, errorReport: plan.errors as Prisma.InputJsonValue }, select });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
      this.previews.delete(id); return job;
    } catch (error) {
      // Serializable rollback restores PENDING. Never overwrite a concurrent successful confirmation.
      if (!(error instanceof ConflictException) && !(error instanceof ForbiddenException)) {
        await this.prisma.importJob.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'FAILED', successRows: 0, failedRows: preview.source.rows.length,
          completedAt: new Date(), errorReport: [{ row: 0, error: 'Import failed. No business data was committed. Upload again to retry.' }] } });
        this.previews.delete(id);
      }
      databaseError(error);
    }
  }
  async cancel(rawId: string, input: unknown, user: AuthenticatedUser) {
    bodyObject(input ?? {}, []); const id = uuidValue(rawId);
    await this.prisma.$transaction(async (tx) => {
      await this.requireAdmin(tx, user);
      const result = await tx.importJob.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'FAILED', completedAt: new Date(), errorReport: [{ row: 0, error: 'Cancelled before importing.' }] } });
      if (!result.count) throw new ConflictException('Only pending imports can be cancelled.');
    });
    this.previews.delete(id); return this.detail(id);
  }
}
