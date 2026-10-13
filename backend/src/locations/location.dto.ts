import { BadRequestException } from '@nestjs/common';
import { bodyObject, booleanValue, choiceValue, listQuery, optionalText, requiredText } from '../common/validation';

export const LOCATION_TYPES = ['CENTRAL_WAREHOUSE', 'STORE'] as const;
export interface LocationInput {
  code: string;
  name: string;
  locationType: (typeof LOCATION_TYPES)[number];
  address?: string | null;
  district?: string | null;
  city?: string | null;
  isActive: boolean;
}

export function parseLocation(input: unknown, partial: true): Partial<LocationInput>;
export function parseLocation(input: unknown, partial?: false): LocationInput;
export function parseLocation(input: unknown, partial = false): Partial<LocationInput> {
  const body = bodyObject(input, ['code', 'name', 'locationType', 'address', 'district', 'city', 'isActive']);
  if (partial && Object.keys(body).length === 0) throw new BadRequestException('Provide at least one field to update.');
  const result: Partial<LocationInput> = {};
  if (!partial || 'code' in body) result.code = requiredText(body.code, 'Code', 30);
  if (!partial || 'name' in body) result.name = requiredText(body.name, 'Name', 150);
  if (!partial || 'locationType' in body) result.locationType = choiceValue(body.locationType, LOCATION_TYPES, 'Location type');
  if ('address' in body) result.address = optionalText(body.address, 'Address', 2000);
  if ('district' in body) result.district = optionalText(body.district, 'District', 100);
  if ('city' in body) result.city = optionalText(body.city, 'City', 100);
  if ('isActive' in body) result.isActive = booleanValue(body.isActive);
  else if (!partial) result.isActive = true;
  return result;
}

export function locationQuery(input: unknown) {
  const { query, ...common } = listQuery(input, ['type']);
  return { ...common, type: query.type === undefined ? undefined : choiceValue(query.type, LOCATION_TYPES, 'Location type') };
}
