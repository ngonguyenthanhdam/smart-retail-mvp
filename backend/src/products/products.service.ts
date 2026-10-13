import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { databaseError } from '../common/database-errors';
import { listQuery, uuidValue } from '../common/validation';
import { parseProduct } from './product.dto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';

export const productSelect = {
  id: true, sku: true, barcode: true, name: true, imageKey: true, categoryId: true, baseUnitId: true, purchaseUnitId: true,
  purchaseToBaseRatio: true, trackExpiry: true, shelfLifeDays: true, isActive: true,
  createdAt: true, updatedAt: true,
  category: { select: { id: true, code: true, name: true } },
  baseUnit: { select: { id: true, code: true, name: true, symbol: true, allowFraction: true } },
  purchaseUnit: { select: { id: true, code: true, name: true, symbol: true } },
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(input: unknown, user: AuthenticatedUser) {
    const { query, search, status, page, pageSize } = listQuery(input, ['categoryId', 'available']);
    if (query.available !== undefined && query.available !== 'true') throw new BadRequestException('Available must be true when provided.');
    const available = query.available === 'true';
    if (available && user.role === 'STAFF') throw new ForbiddenException('Global product selection requires store management access.');
    const locationId = resolveLocationScope(user);
    const where: Prisma.ProductWhereInput = { deletedAt: null,
      ...(query.categoryId ? { categoryId: uuidValue(query.categoryId) } : {}),
      ...(status === 'active' ? { isActive: true } : status === 'inactive' ? { OR: [{ isActive: false }, { isActive: null }] } : {}),
      ...(search ? { AND: [{ OR: ['sku', 'name', 'barcode'].map((key) => ({ [key]: { contains: search, mode: 'insensitive' } })) }] } : {}),
      ...(available || user.role === 'STAFF' ? { isActive: true } : {}),
      ...(user.role !== 'ADMIN' && !available ? { storeProducts: { some: { locationId, ...(user.role === 'STAFF' ? { isActive: true } : {}) } } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, select: { ...productSelect, ...(user.role === 'ADMIN' || (user.role === 'STORE_MANAGER' && !available) ? { defaultCost: true } : {}) }, orderBy: [{ sku: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.product.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items, total, page, pageSize };
  }
  async detail(rawId: string, user: AuthenticatedUser) {
    const locationId = resolveLocationScope(user);
    const row = await this.prisma.product.findFirst({ where: { id: uuidValue(rawId), deletedAt: null,
      ...(user.role !== 'ADMIN' ? { storeProducts: { some: { locationId, ...(user.role === 'STAFF' ? { isActive: true } : {}) } } } : {}),
      ...(user.role === 'STAFF' ? { isActive: true } : {}),
    }, select: { ...productSelect, ...(user.role !== 'STAFF' ? { defaultCost: true } : {}) } });
    if (!row) throw new NotFoundException('Product not found.');
    return row;
  }
  private async validateRelations(tx: Prisma.TransactionClient, data: { categoryId?: string | null; baseUnitId?: string | null; purchaseUnitId?: string | null; isActive?: boolean | null }) {
    const category = data.categoryId && await tx.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new BadRequestException('Select a category.');
    if (data.isActive !== false && !category.isActive) throw new ConflictException('An active product requires an active category.');
    for (const id of [data.baseUnitId, data.purchaseUnitId]) {
      if (!id || !await tx.unit.findUnique({ where: { id } })) throw new BadRequestException('Select valid base and purchase units.');
    }
  }
  async create(input: unknown) {
    const data = parseProduct(input, false);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.validateRelations(tx, data);
        return tx.product.create({ data: { ...data, sku: data.sku!, name: data.name!, createdAt: new Date() }, select: { ...productSelect, defaultCost: true } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error, 'This SKU or barcode is already in use.'); }
  }
  async update(rawId: string, input: unknown) {
    const id = uuidValue(rawId); const data = parseProduct(input, true);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.product.findFirst({ where: { id, deletedAt: null } });
        if (!current) throw new NotFoundException('Product not found.');
        const baseChanged = data.baseUnitId !== undefined && data.baseUnitId !== current.baseUnitId;
        const purchaseChanged = data.purchaseUnitId !== undefined && data.purchaseUnitId !== current.purchaseUnitId;
        if (((baseChanged || purchaseChanged) && await tx.purchaseOrderItem.count({ where: { productId: id } })) ||
            (baseChanged && await tx.saleItem.count({ where: { productId: id } }))) {
          throw new ConflictException('Units cannot change after related transaction history exists.');
        }
        if (data.baseUnitId !== undefined && data.baseUnitId !== current.baseUnitId && await tx.inventoryLot.count({ where: { productId: id } })) {
          throw new ConflictException('The base unit cannot change after inventory lots exist.');
        }
        if (data.trackExpiry === true && await tx.inventoryLot.count({ where: { productId: id, expiryDate: null } })) {
          throw new ConflictException('All existing lots require expiry dates before enabling expiry tracking.');
        }
        await this.validateRelations(tx, { ...current, ...data });
        return tx.product.update({ where: { id }, data, select: { ...productSelect, defaultCost: true } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error, 'This SKU or barcode is already in use.'); }
  }
}
