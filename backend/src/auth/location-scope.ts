import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from './auth.types';

// Undefined means chain-wide access for ADMIN only. Use the result in DB filters.
export function resolveLocationScope(
  user: Pick<AuthenticatedUser, 'role' | 'locationId'>,
  requestedLocationId?: unknown,
): string | undefined {
  if (requestedLocationId !== undefined && (typeof requestedLocationId !== 'string' || requestedLocationId.trim() === '')) {
    throw new ForbiddenException('A valid location is required.');
  }
  if (user.role === 'ADMIN') return requestedLocationId;
  if ((user.role !== 'STORE_MANAGER' && user.role !== 'STAFF') || !user.locationId ||
    (requestedLocationId !== undefined && requestedLocationId !== user.locationId)) {
    throw new ForbiddenException('This location is outside your assigned store.');
  }
  return user.locationId;
}
