import { BadRequestException } from '@nestjs/common';
import { ROLE_CODES, type RoleCode } from '../auth/auth.types';
import { bodyObject, booleanValue, choiceValue, emailAddress, listQuery, passwordValue, requiredText, uuidValue } from '../common/validation';

export interface UserChanges {
  email: string;
  fullName: string;
  role: RoleCode;
  locationId: string | null;
  isActive: boolean;
}
export interface CreateUserInput extends UserChanges { username: string; password: string }
const editableFields = ['email', 'fullName', 'role', 'locationId', 'isActive'];

export function parseUserChanges(input: unknown): Partial<UserChanges> {
  const body = bodyObject(input, editableFields);
  if (!Object.keys(body).length) throw new BadRequestException('Provide at least one field to update.');
  const data: Partial<UserChanges> = {};
  if ('email' in body) data.email = emailAddress(body.email);
  if ('fullName' in body) data.fullName = requiredText(body.fullName, 'Full name', 150);
  if ('role' in body) data.role = choiceValue(body.role, ROLE_CODES, 'Role');
  if ('locationId' in body) data.locationId = body.locationId === null ? null : uuidValue(body.locationId);
  if ('isActive' in body) data.isActive = booleanValue(body.isActive);
  return data;
}

export function parseCreateUser(input: unknown): CreateUserInput {
  const body = bodyObject(input, [...editableFields, 'username', 'password']);
  return {
    username: requiredText(body.username, 'Username', 100),
    password: passwordValue(body.password),
    email: emailAddress(body.email),
    fullName: requiredText(body.fullName, 'Full name', 150),
    role: choiceValue(body.role, ROLE_CODES, 'Role'),
    locationId: body.locationId === undefined || body.locationId === null ? null : uuidValue(body.locationId),
    isActive: body.isActive === undefined ? true : booleanValue(body.isActive),
  };
}

export function userQuery(input: unknown) {
  const { query, ...common } = listQuery(input, ['role']);
  return { ...common, role: query.role === undefined ? undefined : choiceValue(query.role, ROLE_CODES, 'Role') };
}
