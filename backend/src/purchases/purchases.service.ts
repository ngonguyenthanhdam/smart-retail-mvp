import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { bodyObject, optionalText, uuidValue } from '../common/validation';
import { decimalValue } from '../common/decimal';
import { databaseError } from '../common/database-errors';
import { activeLocation, creatorSelect, dateValue, itemArray, locationSelect, money, operationProductSelect, operationQuery, timestampValue, writeActor } from '../common/operations';
import { businessDate } from '../inventory/expiry';

const summarySelect = { id: true, orderNumber: true, importJobId: true, replenishmentRecommendationId: true, locationId: true, status: true, orderedAt: true, receivedAt: true, totalCost: true, note: true, createdAt: true, updatedAt: true,
  location: { select: locationSelect }, creator: { select: creatorSelect } } as const;
const detailSelect = { ...summarySelect, items: { orderBy: { id: 'asc' }, select: { id: true, productId: true, purchaseQuantity: true, baseQuantity: true, unitCost: true, lotNumber: true, expiryDate: true, lineTotal: true, product: { select: operationProductSelect } } } } as const;

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}
  async list(input: unknown, user: AuthenticatedUser) {
    const q = operationQuery(input, ['DRAFT', 'RECEIVED', 'CANCELLED']);
    const locationId = resolveLocationScope(user, q.requestedLocation);
    const where: Prisma.PurchaseOrderWhereInput = { ...(locationId ? { locationId } : {}), ...(q.status ? { status: q.status } : {}),
      orderedAt: q.timestampRange, ...(q.search ? { orderNumber: { contains: q.search, mode: 'insensitive' } } : {}) };
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.purchaseOrder.findMany({ where, select: summarySelect, orderBy: [{ orderedAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize });
      const total = await tx.purchaseOrder.count({ where }); return { items, total, page: q.page, pageSize: q.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async detail(rawId: string, user: AuthenticatedUser) {
    const locationId = resolveLocationScope(user);
    const row = await this.prisma.purchaseOrder.findFirst({ where: { id: uuidValue(rawId), ...(locationId ? { locationId } : {}) }, select: detailSelect });
    if (!row) throw new NotFoundException('Purchase order not found.');
    return row;
  }
  private async draftData(tx: Prisma.TransactionClient, input: unknown, actor: Pick<AuthenticatedUser, 'role' | 'locationId'>) {
    const body = bodyObject(input, ['locationId', 'orderedAt', 'note', 'items']);
    const locationId = await activeLocation(tx, actor, body.locationId === undefined ? undefined : uuidValue(body.locationId));
    const orderedAt = timestampValue(body.orderedAt, 'Order date');
    const note = optionalText(body.note ?? null, 'Note', 4000);
    const items = [];
    for (const value of itemArray(body.items)) {
      const item = bodyObject(value, ['productId', 'purchaseQuantity', 'unitCost', 'lotNumber', 'expiryDate']);
      const productId = uuidValue(item.productId);
      const product = await tx.product.findFirst({ where: { id: productId, isActive: true, deletedAt: null } });
      if (!product?.purchaseToBaseRatio || !product.baseUnitId || !product.purchaseUnitId) throw new BadRequestException('Select an active product with valid units and conversion ratio.');
      const purchaseQuantity = decimalValue(item.purchaseQuantity, 'Purchase quantity', 4, true);
      const baseQuantity = decimalValue(purchaseQuantity.mul(product.purchaseToBaseRatio).toFixed(), 'Converted base quantity', 4, true);
      const unitCost = decimalValue(item.unitCost, 'Cost per purchase unit', 2);
      items.push({ productId, purchaseQuantity, baseQuantity, unitCost, lotNumber: optionalText(item.lotNumber ?? null, 'Lot number', 100),
        expiryDate: item.expiryDate == null || item.expiryDate === '' ? null : dateValue(item.expiryDate, 'Expiry date'), lineTotal: money(purchaseQuantity.mul(unitCost), 'Line total') });
    }
    const totalCost = money(items.reduce((sum, item) => sum.add(item.lineTotal), new Prisma.Decimal(0)), 'Total cost');
    return { locationId, orderedAt, note, totalCost, items };
  }
  async create(input: unknown, user: AuthenticatedUser) {
    try {
      return await this.prisma.$transaction(tx => this.createDraft(tx,input,user), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    } catch (error) { databaseError(error); }
  }
  async createDraft(tx: Prisma.TransactionClient, input: unknown, user: AuthenticatedUser, replenishmentRecommendationId?: string) {
    const actor = await writeActor(tx,user);
    const { items, ...data } = await this.draftData(tx,input,actor);
    return tx.purchaseOrder.create({ data: { ...data, replenishmentRecommendationId, orderNumber: `PO-${randomUUID()}`, status: 'DRAFT', createdBy: user.id, createdAt: new Date(), items: { create: items } }, select: detailSelect });
  }
  async update(rawId: string, input: unknown, user: AuthenticatedUser) {
    const id = uuidValue(rawId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = await writeActor(tx, user); const locationId = resolveLocationScope(actor);
        const current = await tx.purchaseOrder.findFirst({ where: { id, ...(locationId ? { locationId } : {}) } });
        if (!current) throw new NotFoundException('Purchase order not found.');
        this.requireDraft(current.status, current.importJobId);
        const { items, ...data } = await this.draftData(tx, input, actor);
        if (current.replenishmentRecommendationId) {
          const recommendation = await tx.replenishmentRecommendation.findUniqueOrThrow({ where: { id: current.replenishmentRecommendationId } });
          if (data.locationId !== recommendation.locationId || items.length !== 1 || items[0]!.productId !== recommendation.productId) {
            throw new BadRequestException('A linked recommendation purchase must retain its store and single product.');
          }
        }
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        return tx.purchaseOrder.update({ where: { id }, data: { ...data, items: { create: items } }, select: detailSelect });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    } catch (error) { databaseError(error); }
  }
  private requireDraft(status: string, importJobId: string | null) {
    if (importJobId) throw new ConflictException('Historical imported purchases cannot be edited, cancelled or received.');
    if (status !== 'DRAFT') throw new ConflictException({ code: status === 'RECEIVED' ? 'PURCHASE_ALREADY_RECEIVED' : 'PURCHASE_NOT_DRAFT', message: 'Only a draft purchase order can be changed.' });
  }
  async receive(rawId: string, input: unknown, user: AuthenticatedUser) {
    bodyObject(input ?? {}, []); const id = uuidValue(rawId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = await writeActor(tx, user); const scope = resolveLocationScope(actor);
        const order = await tx.purchaseOrder.findFirst({ where: { id, ...(scope ? { locationId: scope } : {}) }, include: { items: { orderBy: { id: 'asc' } } } });
        if (!order) throw new NotFoundException('Purchase order not found.');
        this.requireDraft(order.status, order.importJobId);
        const locationId = await activeLocation(tx, actor, order.locationId ?? undefined);
        if (!order.items.length) throw new BadRequestException('A purchase order requires at least one item.');
        const now = new Date(); const today = new Date(businessDate(now));
        const claimed = await tx.purchaseOrder.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'RECEIVED', receivedAt: now } });
        if (claimed.count !== 1) throw new ConflictException({ code: 'PURCHASE_NOT_DRAFT', message: 'This order changed. Refresh before receiving.' });
        for (const item of order.items) {
          const product = item.productId && await tx.product.findFirst({ where: { id: item.productId, isActive: true, deletedAt: null } });
          if (!product) throw new BadRequestException('All purchase items must reference active products.');
          if ((product.trackExpiry && !item.expiryDate) || (item.expiryDate && item.expiryDate < today)) {
            throw new BadRequestException({ code: 'INVALID_EXPIRY_DATE', message: 'Tracked products require an expiry date. Received goods cannot already be expired.' });
          }
          const lotNumber = item.lotNumber ?? `LOT-${item.id}`;
          const unitCost = money(item.unitCost.mul(item.purchaseQuantity).div(item.baseQuantity), 'Cost per base unit');
          await tx.inventoryLot.create({ data: { locationId, productId: product.id, lotNumber, quantityOnHand: item.baseQuantity, unitCost, receivedDate: today, expiryDate: item.expiryDate, purchaseOrderItemId: item.id, createdAt: now } });
          if (!item.lotNumber) await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { lotNumber } });
        }
        return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, select: detailSelect });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    } catch (error) { databaseError(error); }
  }
  async cancel(rawId: string, input: unknown, user: AuthenticatedUser) {
    bodyObject(input ?? {}, []); const id = uuidValue(rawId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = await writeActor(tx, user); const locationId = resolveLocationScope(actor);
        const current = await tx.purchaseOrder.findFirst({ where: { id, ...(locationId ? { locationId } : {}) } });
        if (!current) throw new NotFoundException('Purchase order not found.');
        this.requireDraft(current.status, current.importJobId);
        return tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' }, select: detailSelect });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error); }
  }
}
