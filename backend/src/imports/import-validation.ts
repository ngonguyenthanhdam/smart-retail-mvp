import { BadRequestException, HttpException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { dateValue, timestampValue } from '../common/operations';
import type { RowError, SourceFile } from './import-file';

export function booleanCell(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  if (value !== 'true' && value !== 'false') throw new BadRequestException('Boolean fields must be true or false.');
  return value === 'true';
}
export function importTimestamp(value: string | undefined, field: string) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(dateValue(value, field).getTime() - 7 * 3600000);
  return timestampValue(value, field);
}
export function validationError(error: unknown): string {
  if (error instanceof HttpException && [400, 409].includes(error.getStatus())) return error.message;
  throw error;
}
export function sourceErrors(source: SourceFile, uniqueFields: string[] = []): Map<number, string> {
  const errors = new Map<number, string>();
  for (const row of source.rows) if (row.error) errors.set(row.row, row.error);
  for (const field of uniqueFields) {
    const counts = new Map<string, number>();
    for (const { values } of source.rows) if (values[field]) counts.set(values[field], (counts.get(values[field]) ?? 0) + 1);
    for (const row of source.rows) if ((counts.get(row.values[field] ?? '') ?? 0) > 1) errors.set(row.row, `Duplicate ${field} in this file.`);
  }
  return errors;
}
export function errorRows(errors: Map<number, string>): RowError[] {
  return [...errors].sort((a, b) => a[0] - b[0]).map(([row, error]) => ({ row, error }));
}
export async function sourceProduct(tx: Prisma.TransactionClient, sku: string | undefined, active = false) {
  if (!sku) throw new BadRequestException('Product SKU is required.');
  const product = await tx.product.findUnique({ where: { sku } });
  if (!product || product.deletedAt || (active && !product.isActive)) throw new BadRequestException(active ? 'Unknown or inactive product SKU.' : 'Unknown product SKU.');
  return product;
}
export async function sourceLocation(tx: Prisma.TransactionClient, code: string | undefined, storeOnly = false, active = false) {
  if (!code) throw new BadRequestException('Location code is required.');
  const location = await tx.location.findUnique({ where: { code } });
  if (!location || location.deletedAt || (storeOnly && location.locationType !== 'STORE') || (active && !location.isActive)) throw new BadRequestException('Unknown or unavailable location code.');
  return location;
}
