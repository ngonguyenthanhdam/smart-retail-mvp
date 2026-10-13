import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { bodyObject, uuidValue } from '../common/validation';
import { activeLocation, creatorSelect, itemArray, locationSelect, money, operationProductSelect, operationQuery, writeActor } from '../common/operations';
import { decimalValue } from '../common/decimal';
import { databaseError } from '../common/database-errors';
import { consumeStock } from '../inventory/consume-stock';
import { businessDate } from '../inventory/expiry';

const summarySelect = { id: true, invoiceNumber: true, importJobId: true, locationId: true, soldAt: true, subtotal: true, discountAmount: true, totalAmount: true, status: true, createdAt: true,
  location: { select: locationSelect }, creator: { select: creatorSelect } } as const;
export const saleDetailSelect = (costs: boolean) => ({ ...summarySelect, items: { orderBy: { id: 'asc' }, select: {
  id: true, productId: true, quantity: true, unitPrice: true, discountAmount: true, lineTotal: true,
  ...(costs ? { costOfGoodsSold: true } : {}), product: { select: operationProductSelect },
} } } as const);

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}
  async create(input: unknown, user: AuthenticatedUser) {
    const body = bodyObject(input, ['locationId', 'discountAmount', 'items', 'clientRequestId', 'expectedTotal']);
    const requested = body.locationId === undefined ? undefined : uuidValue(body.locationId);
    const clientRequestId = body.clientRequestId === undefined ? undefined : uuidValue(body.clientRequestId);
    const expectedTotal = body.expectedTotal === undefined ? undefined : decimalValue(body.expectedTotal, 'Expected total', 2);
    const discountAmount = decimalValue(body.discountAmount ?? 0, 'Invoice discount', 2);
    const requestedItems = itemArray(body.items).map((value) => {
      const item = bodyObject(value, ['productId', 'quantity']);
      return { productId: uuidValue(item.productId), quantity: decimalValue(item.quantity, 'Quantity', 4, true) };
    }).sort((a, b) => a.productId.localeCompare(b.productId));
    if (new Set(requestedItems.map((i) => i.productId)).size !== requestedItems.length) throw new BadRequestException('Combine quantities into one line per product.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = await writeActor(tx, user, true);
        const locationId = await activeLocation(tx, actor, requested, true);
        const requestHash = createHash('sha256').update(JSON.stringify({ actor: user.id, locationId,
          discount: discountAmount.toString(), expectedTotal: expectedTotal?.toString(),
          items: requestedItems.map((item) => [item.productId, item.quantity.toString()]) })).digest('hex');
        if (clientRequestId) {
          const previous = await tx.sale.findUnique({ where: { clientRequestId }, select: { id: true, createdBy: true, locationId: true, requestHash: true } });
          if (previous) {
            if (previous.createdBy !== user.id || previous.locationId !== locationId || previous.requestHash !== requestHash) {
              throw new ConflictException({ code: 'SALE_REQUEST_CONFLICT', message: 'This checkout reference was already used for a different sale.' });
            }
            return tx.sale.findUniqueOrThrow({ where: { id: previous.id }, select: saleDetailSelect(actor.role !== 'STAFF') });
          }
        }
        const lines = [];
        for (const item of requestedItems) {
          const setting = await tx.storeProduct.findFirst({ where: { locationId, productId: item.productId, isActive: true, product: { isActive: true, deletedAt: null } }, include: { product: { select: { id: true, name: true, trackExpiry: true, baseUnit: { select: { allowFraction: true } } } } } });
          if (!setting?.product) throw new BadRequestException({ code: 'PRODUCT_NOT_AVAILABLE_AT_STORE', message: 'Each product must be active and enabled at this store.' });
          if (setting.product.baseUnit?.allowFraction === false && !item.quantity.isInteger()) {
            throw new BadRequestException({ code: 'WHOLE_QUANTITY_REQUIRED', message: 'This product must be sold in whole units.' });
          }
          lines.push({ ...item, product: setting.product, unitPrice: setting.sellingPrice, lineTotal: money(setting.sellingPrice.mul(item.quantity), 'Line total') });
        }
        const subtotal = money(lines.reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0)), 'Subtotal');
        if (discountAmount.greaterThan(subtotal)) throw new BadRequestException({ code: 'INVALID_DISCOUNT', message: 'Invoice discount must not exceed subtotal.' });
        if (actor.role === 'STAFF' && !discountAmount.isZero()) {
          throw new ForbiddenException({ code: 'DISCOUNT_REQUIRES_MANAGER', message: 'Only a manager can authorize a manual invoice discount.' });
        }
        if (expectedTotal !== undefined && !expectedTotal.equals(subtotal.sub(discountAmount))) {
          throw new ConflictException({ code: 'PRICE_CHANGED', message: 'Selling prices changed. Refresh the cart and confirm the new total.' });
        }
        const now = new Date(); const today = new Date(businessDate(now)); const items = [];
        for (const { product, ...line } of lines) {
          const costOfGoodsSold = await consumeStock(tx, locationId, product, line.quantity, today);
          items.push({ ...line, discountAmount: new Prisma.Decimal(0), promotionFlag: false, costOfGoodsSold });
        }
        return tx.sale.create({ data: { invoiceNumber: `INV-${randomUUID()}`, clientRequestId, requestHash: clientRequestId ? requestHash : null,
          locationId, soldAt: now, subtotal, discountAmount, totalAmount: subtotal.sub(discountAmount), status: 'COMPLETED', createdBy: user.id, createdAt: now, items: { create: items } }, select: saleDetailSelect(actor.role !== 'STAFF') });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    } catch (error) { databaseError(error); }
  }
  async list(input: unknown, user: AuthenticatedUser) {
    const q = operationQuery(input, ['COMPLETED', 'VOIDED']);
    const locationId = resolveLocationScope(user, q.requestedLocation);
    const where: Prisma.SaleWhereInput = { ...(locationId ? { locationId } : {}), ...(q.status ? { status: q.status } : {}),
      soldAt: q.timestampRange, ...(q.search ? { invoiceNumber: { contains: q.search, mode: 'insensitive' } } : {}) };
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.sale.findMany({ where, select: summarySelect, orderBy: [{ soldAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize });
      const total = await tx.sale.count({ where }); return { items, total, page: q.page, pageSize: q.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async detail(rawId: string, user: AuthenticatedUser) {
    const locationId = resolveLocationScope(user);
    const row = await this.prisma.sale.findFirst({ where: { id: uuidValue(rawId), ...(locationId ? { locationId } : {}) }, select: saleDetailSelect(user.role !== 'STAFF') });
    if (!row) throw new NotFoundException('Sale not found.');
    return row;
  }
}
