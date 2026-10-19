import { CanActivate, ExecutionContext, HttpException, Injectable, NestInterceptor, CallHandler } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from '../auth/auth.types';
import { finalize } from 'rxjs';
import { mkdir, readFile, writeFile, rename, unlink, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { uuidValue } from '../common/validation';

export const AI_LIMITS = { files: 20, fileBytes: 10 * 1024 * 1024, batchBytes: 100 * 1024 * 1024, rows: 400000, stagingDays: 7, errorSamples: 100, datasetsPerUser: 10 };
export const ML_DIRECTORY = resolve(__dirname, '../../../../ml-service');
export const hashBytes = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function aiError(code: string, message: string, status = 400): never { throw new HttpException({ code, message }, status); }
export function checkAiUser(user: AuthenticatedUser) {
  if (!user || !['ADMIN', 'STORE_MANAGER'].includes(user.role)) aiError('ACCESS_DENIED', 'Bạn không có quyền sử dụng AI Center.', 403);
}
export function checkScope(user: AuthenticatedUser, locationId: string | null, ownerId?: string, external = false) {
  checkAiUser(user);
  if (user.role === 'STORE_MANAGER' && (external || !locationId || user.locationId !== locationId || (ownerId && ownerId !== user.id))) {
    aiError('ACCESS_DENIED', 'Dữ liệu không thuộc phạm vi tài khoản đang dùng.', 403);
  }
}
export function numberOption(value: unknown, fallback: number, min: number, max: number, name: string) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'number' || !Number.isFinite(result) || result < min || result > max) aiError('INVALID_FORMAT', `${name}: chọn giá trị từ ${min} đến ${max}.`);
  return result;
}
export const audit = (tx: Prisma.TransactionClient | PrismaService, actorId: string, action: string, recordId: string, detail: unknown = {}) =>
  tx.aiAuditEvent.create({ data: { actorId, action, recordId, detail: jsonValue(detail) } });

@Injectable()
export class AiGuard implements CanActivate {
  canActivate(context: ExecutionContext) { checkAiUser(context.switchToHttp().getRequest<AuthenticatedRequest>().user!); return true; }
}

@Injectable()
export class AiResourceInterceptor implements NestInterceptor {
  private active = 0;
  private callers = new Map<string, { count: number; until: number }>();
  intercept(context: ExecutionContext, next: CallHandler) {
    context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>().setHeader('Cache-Control', 'no-store');
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.method === 'GET') return next.handle();
    const now = Date.now();
    for (const [key, rate] of this.callers) if (rate.until < now) this.callers.delete(key);
    const key = request.user!.id;
    const rate = this.callers.get(key) ?? { count: 0, until: now + 60000 };
    if (this.active >= 3 || rate.count >= 30) aiError('RESOURCE_LIMIT', 'Hệ thống đang bận. Vui lòng chờ một phút rồi thử lại.', 429);
    rate.count++; this.callers.set(key, rate); this.active++;
    return next.handle().pipe(finalize(() => { this.active--; }));
  }
}

@Injectable()
export class AiStorage {
  readonly root = resolve(process.env.AI_STORAGE_ROOT || resolve(__dirname, '../../../../.local/ai-center'));
  path(id: string, name: string) {
    uuidValue(id);
    if (!/^[a-zA-Z0-9_.-]{1,140}$/.test(name) || name.includes('..')) aiError('INVALID_FORMAT', 'Tên artifact không hợp lệ.');
    return join(this.root, id, name);
  }
  async write(id: string, name: string, data: string | Buffer) {
    const target = this.path(id, name); await mkdir(join(this.root, id), { recursive: true });
    const temporary = target + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, data, { flag: 'wx' });
    try { await rename(temporary, target); } catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
  }
  async read(id: string, name: string, max = AI_LIMITS.batchBytes) {
    const target = this.path(id, name);
    if ((await stat(target)).size > max) aiError('RESOURCE_LIMIT', 'Artifact vượt giới hạn đọc.');
    return readFile(target);
  }
  async remove(id: string, name: string) { await unlink(this.path(id, name)).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; }); }
  async clearStaging(id: string) {
    // Never recursively delete supplied paths, published artifacts or model versions.
    const directory = join(this.root, uuidValue(id));
    const files = await readdir(directory).catch(() => [] as string[]);
    for (const name of files) if (/^(?:[a-f0-9-]{36}|snapshot-\d+)\.csv(?:\.[a-f0-9-]{36}\.tmp)?$/.test(name)) await this.remove(id, name);
  }
}
