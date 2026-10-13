import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

export function databaseError(error: unknown, duplicateMessage = 'This code, username or email is already in use.'): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw new ConflictException(duplicateMessage);
    }
    if (error.code === 'P2034') {
      throw new ConflictException('The data changed while saving. Refresh and try again.');
    }
  }
  // A serialization failure at COMMIT can escape the adapter before Prisma wraps it as P2034.
  if (error instanceof Error && error.name === 'DriverAdapterError' &&
    error.cause !== null && typeof error.cause === 'object' &&
    'kind' in error.cause && error.cause.kind === 'TransactionWriteConflict') {
    throw new ConflictException('The data changed while saving. Refresh and try again.');
  }
  throw error;
}
