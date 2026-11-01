import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from './auth.types';

export function resolveLocationScope(
  user: Pick<AuthenticatedUser, 'role' | 'locationId'>,
  requestedLocationId?: unknown,
): string | undefined {
  if (
    requestedLocationId !== undefined &&
    (typeof requestedLocationId !== 'string' || requestedLocationId.trim() === '')
  ) {
    throw new ForbiddenException('A valid location is required.');
  }
  if (user.role === 'ADMIN') return requestedLocationId;
  if (
    (user.role !== 'STORE_MANAGER' && user.role !== 'STAFF') ||
    !user.locationId ||
    (requestedLocationId !== undefined && requestedLocationId !== user.locationId)
  ) {
    throw new ForbiddenException('This location is outside your assigned store.');
  }
  return user.locationId;
}
