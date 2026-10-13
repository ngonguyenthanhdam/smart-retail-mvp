import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

// Preserve intermediate products/divisions of NUMERIC(14,*) values before rounding money.
Prisma.Decimal.set({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_UP });

export function decimalValue(value: unknown, field: string, scale: 2 | 4, positive = false): Prisma.Decimal {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(\.\d+)?$/.test(text) || (text.split('.')[1]?.length ?? 0) > scale) {
    throw new BadRequestException(`${field} must be a non-negative decimal with at most ${scale} decimal places.`);
  }
  const decimal = new Prisma.Decimal(text);
  if (decimal.greaterThanOrEqualTo(new Prisma.Decimal(10).pow(14 - scale)) || (positive && decimal.lessThanOrEqualTo(0))) {
    throw new BadRequestException(`${field} is outside the allowed range.`);
  }
  return decimal;
}
