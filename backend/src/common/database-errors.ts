import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../database/prisma.service';

// Retry only transactions that PostgreSQL aborted; never retry an ambiguous commit.
export async function serializable<T>(
  prisma: PrismaService,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(action, { isolationLevel: 'Serializable', timeout: 15000 });
    } catch (error) {
      const conflict =
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') ||
        (error instanceof Error && error.name === 'DriverAdapterError' &&
          typeof error.cause === 'object' && error.cause !== null &&
          'kind' in error.cause && error.cause.kind === 'TransactionWriteConflict');
      if (!conflict || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

export function databaseError(
  error: unknown,
  duplicateMessage = 'This code, username or email is already in use.',
): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw new ConflictException(duplicateMessage);
    }
    if (error.code === 'P2034') {
      throw new ConflictException('The data changed while saving. Refresh and try again.');
    }
  }

  if (
    error instanceof Error &&
    error.name === 'DriverAdapterError' &&
    error.cause !== null &&
    typeof error.cause === 'object' &&
    'kind' in error.cause &&
    error.cause.kind === 'TransactionWriteConflict'
  ) {
    throw new ConflictException('The data changed while saving. Refresh and try again.');
  }
  throw error;
}
