import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { bodyObject, choiceValue, listQuery, uuidValue } from './validation';
import { decimalValue } from './decimal';

export const locationSelect = { id: true, code: true, name: true } as const;
export const creatorSelect = { id: true, fullName: true } as const;
export const operationProductSelect = { id: true, sku: true, name: true, imageKey: true, trackExpiry: true,
  baseUnit: { select: { code: true, name: true, allowFraction: true } }, purchaseUnit: { select: { code: true, name: true } } } as const;

export function dateValue(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 1900) throw new BadRequestException(`${field} must be a valid date from 1900 onward.`);
  return date;
}
export function timestampValue(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new BadRequestException(`${field} must be an ISO timestamp with timezone.`);
  dateValue(value.slice(0, 10), field);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new BadRequestException(`${field} is invalid.`);
  return date;
}
export function money(value: Prisma.Decimal, field: string): Prisma.Decimal {
  return decimalValue(value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2), field, 2);
}
export function itemArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new BadRequestException('Provide between 1 and 100 items.');
  return value;
}
export function operationQuery(input: unknown, statuses: readonly string[] = [], extras: readonly string[] = []) {
  const query = bodyObject(input, ['search', 'page', 'pageSize', 'locationId', 'status', 'from', 'to', ...extras]);
  const { page, pageSize, search } = listQuery({ search: query.search, page: query.page, pageSize: query.pageSize });
  const status = query.status === undefined || query.status === 'all' ? undefined : choiceValue(query.status, statuses, 'Status');
  const from = query.from === undefined ? undefined : dateValue(query.from, 'From date');
  const to = query.to === undefined ? undefined : dateValue(query.to, 'To date');
  if (from && to && from > to) throw new BadRequestException('From date must not follow to date.');
  // Timestamp filters use Vietnam business-day boundaries; DATE fields use from/to directly.
  const timestampRange = { ...(from ? { gte: new Date(from.getTime() - 7 * 3600000) } : {}), ...(to ? { lt: new Date(to.getTime() + 17 * 3600000) } : {}) };
  return { query, page, pageSize, search, status, from, to, timestampRange,
    requestedLocation: query.locationId === undefined ? undefined : uuidValue(query.locationId) };
}
export async function writeActor(tx: Prisma.TransactionClient, user: AuthenticatedUser, allowStaff = false) {
  const current = await tx.user.findFirst({ where: { id: user.id, isActive: true, deletedAt: null }, include: { role: true } });
  if (!current || !['ADMIN', 'STORE_MANAGER', ...(allowStaff ? ['STAFF'] : [])].includes(current.role.code)) throw new ForbiddenException('Access to this operation is no longer available.');
  return { role: current.role.code as AuthenticatedUser['role'], locationId: current.locationId };
}
export async function activeLocation(tx: Prisma.TransactionClient, actor: Pick<AuthenticatedUser, 'role' | 'locationId'>, requested?: string, storeOnly = false) {
  const id = resolveLocationScope(actor, requested);
  if (!id || !await tx.location.findFirst({ where: { id, isActive: true, deletedAt: null, ...(storeOnly || actor.role !== 'ADMIN' ? { locationType: 'STORE' } : {}) } })) throw new BadRequestException(storeOnly ? 'Select an active store.' : 'Select an active location.');
  return id;
}
