import type { Request } from 'express';

export const ROLE_CODES = ['ADMIN', 'STORE_MANAGER', 'STAFF'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: RoleCode;
  locationId: string | null;
  location: { id: string; code: string; name: string } | null;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

export function isRoleCode(value: string): value is RoleCode {
  return ROLE_CODES.some((role) => role === value);
}
