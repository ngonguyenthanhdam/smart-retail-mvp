import { BadRequestException } from '@nestjs/common';

export function bodyObject(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('A JSON object is required.');
  }
  if (Object.keys(input).some((key) => !fields.includes(key))) {
    throw new BadRequestException('The request contains unsupported fields.');
  }
  return input as Record<string, unknown>;
}

export function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`${field} is required and must not exceed ${max} characters.`);
  }
  return value.trim();
}

export function emailAddress(value: unknown): string {
  const email = requiredText(value, 'Email', 255);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException('Enter a valid email address.');
  }
  return email;
}

export function passwordValue(value: unknown): string {
  if (typeof value !== 'string' || [...value].length < 8 || Buffer.byteLength(value) > 72) {
    throw new BadRequestException('Password must contain at least 8 characters and at most 72 UTF-8 bytes.');
  }
  return value;
}

export function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) {
    throw new BadRequestException(`${field} must not exceed ${max} characters.`);
  }
  return value.trim() || null;
}

export function booleanValue(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new BadRequestException('Active status must be true or false.');
  return value;
}

export function uuidValue(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException('A valid record ID is required.');
  }
  return value.toLowerCase();
}

export function choiceValue<T extends string>(value: unknown, choices: readonly T[], field: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) {
    throw new BadRequestException(`${field} must be one of: ${choices.join(', ')}.`);
  }
  return value as T;
}

export function listQuery(input: unknown, extraFields: readonly string[] = []) {
  const query = bodyObject(input, ['search', 'status', 'page', 'pageSize', ...extraFields]);
  const number = (value: unknown, fallback: number, max: number, field: string) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) {
      throw new BadRequestException(`${field} must be between 1 and ${max}.`);
    }
    return Number(value);
  };
  return {
    query,
    search: query.search === undefined ? '' : optionalText(query.search, 'Search', 150) ?? '',
    status: query.status === undefined ? 'all' as const : choiceValue(query.status, ['all', 'active', 'inactive'], 'Status'),
    page: number(query.page, 1, 1_000_000, 'Page'),
    pageSize: number(query.pageSize, 20, 100, 'Page size'),
  };
}
