import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { bodyObject, booleanValue, listQuery, uuidValue } from '../common/validation';
import { decimalValue } from '../common/decimal';
import { databaseError } from '../common/database-errors';
import { productSelect } from '../products/products.service';

const selection = (costs: boolean) => ({ id: true, locationId: true, productId: true, sellingPrice: true, safetyStock: true, minStockLevel: true, isActive: true, updatedAt: true,
  location: { select: { id: true, code: true, name: true } }, product: { select: { ...productSelect, ...(costs ? { defaultCost: true } : {}) } } } as const);
function parse(input: unknown, partial: boolean) {
  const body = bodyObject(input, ['sellingPrice', 'safetyStock', 'minStockLevel', 'isActive', ...(!partial ? ['locationId', 'productId'] : [])]);
  if (!Object.keys(body).length) throw new BadRequestException('Provide at least one field.');
  return {
    ...(!partial ? { productId: uuidValue(body.productId), ...(body.locationId !== undefined ? { locationId: uuidValue(body.locationId) } : {}) } : {}),
    ...(!partial || body.sellingPrice !== undefined ? { sellingPrice: decimalValue(body.sellingPrice, 'Selling price', 2) } : {}),
    ...(body.safetyStock !== undefined ? { safetyStock: decimalValue(body.safetyStock, 'Safety stock', 4) } : {}),
    ...(body.minStockLevel !== undefined ? { minStockLevel: decimalValue(body.minStockLevel, 'Minimum stock', 4) } : {}),
    ...(body.isActive !== undefined ? { isActive: booleanValue(body.isActive) } : {}),
  };
}
@Injectable()
export class StoreProductsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(input: unknown, user: AuthenticatedUser) {
    const { query, search, status, page, pageSize } = listQuery(input, ['locationId', 'categoryId']);
    const locationId = resolveLocationScope(user, query.locationId ? uuidValue(query.locationId) : undefined);
    const where: Prisma.StoreProductWhereInput = {
      ...(locationId ? { locationId } : {}), location: { locationType: 'STORE', deletedAt: null },
      product: { deletedAt: null, ...(query.categoryId ? { categoryId: uuidValue(query.categoryId) } : {}),
        ...(user.role === 'STAFF' ? { isActive: true } : {}),
        ...(search ? { OR: ['sku', 'name', 'barcode'].map((key) => ({ [key]: { contains: search, mode: 'insensitive' } })) } : {}) },
      ...(user.role === 'STAFF' || status === 'active' ? { isActive: true } : status === 'inactive' ? { OR: [{ isActive: false }, { isActive: null }] } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.storeProduct.findMany({ where, select: selection(user.role !== 'STAFF'), orderBy: [{ product: { sku: 'asc' } }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize });
      const total = await tx.storeProduct.count({ where });
      return { items, total, page, pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  private async scope(tx: Prisma.TransactionClient, user: AuthenticatedUser, requested?: string) {
    const current = await tx.user.findFirst({ where: { id: user.id, isActive: true, deletedAt: null }, include: { role: true } });
    if (!current || (current.role.code !== 'ADMIN' && current.role.code !== 'STORE_MANAGER')) throw new ForbiddenException('Store configuration access is no longer available.');
    return resolveLocationScope({ role: current.role.code, locationId: current.locationId }, requested);
  }
  private async validate(tx: Prisma.TransactionClient, locationId: string | null | undefined, productId: string | null | undefined, active: boolean) {
    if (!locationId || !await tx.location.findFirst({ where: { id: locationId, locationType: 'STORE', isActive: true, deletedAt: null } })) throw new BadRequestException('Select an active store. Warehouse pricing is not supported.');
    if (!productId || !await tx.product.findFirst({ where: { id: productId, deletedAt: null, ...(active ? { isActive: true } : {}) } })) throw new BadRequestException('Select an active product before creating or activating a store configuration.');
  }
  async create(input: unknown, user: AuthenticatedUser) {
    const data = parse(input, false);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locationId = await this.scope(tx, user, data.locationId);
        await this.validate(tx, locationId, data.productId, true);
        return tx.storeProduct.create({ data: { ...data, locationId, sellingPrice: data.sellingPrice! }, select: selection(true) });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error, 'This product is already configured for this store.'); }
  }
  async update(rawId: string, input: unknown, user: AuthenticatedUser) {
    const id = uuidValue(rawId); const data = parse(input, true);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locationId = await this.scope(tx, user);
        const current = await tx.storeProduct.findFirst({ where: { id, ...(locationId ? { locationId } : {}) } });
        if (!current) throw new NotFoundException('Store product not found.');
        await this.validate(tx, current.locationId, current.productId, data.isActive ?? current.isActive === true);
        return tx.storeProduct.update({ where: { id }, data, select: selection(true) });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error, 'This product is already configured for this store.'); }
  }
}
