import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { bodyObject, booleanValue, listQuery, uuidValue } from '../common/validation';
import { decimalValue } from '../common/decimal';
import { databaseError, serializable } from '../common/database-errors';
import { assignmentOptions, confirmRemainingStock, productDefaults, syncAssignments } from './assignment';
import { productSelect } from '../products/products.service';

const selection = (costs: boolean) =>
  ({
    id: true,
    locationId: true,
    productId: true,
    sellingPrice: true,
    safetyStock: true,
    minStockLevel: true,
    isActive: true,
    updatedAt: true,
    location: { select: { id: true, code: true, name: true } },
    product: { select: { ...productSelect, ...(costs ? { defaultCost: true } : {}) } },
  }) as const;
function parse(input: unknown, partial: boolean) {
  const body = bodyObject(input, [
    'sellingPrice',
    'safetyStock',
    'minStockLevel',
    'isActive',
    'confirmDiscontinue',
    ...(!partial ? ['locationId', 'productId'] : []),
  ]);
  if (!Object.keys(body).length) throw new BadRequestException('Provide at least one field.');
  return {
    ...(!partial
      ? {
          productId: uuidValue(body.productId),
          ...(body.locationId !== undefined ? { locationId: uuidValue(body.locationId) } : {}),
        }
      : {}),
    ...(body.sellingPrice !== undefined
      ? { sellingPrice: decimalValue(body.sellingPrice, 'Selling price', 2, true) }
      : {}),
    ...(body.safetyStock !== undefined
      ? { safetyStock: decimalValue(body.safetyStock, 'Safety stock', 4) }
      : {}),
    ...(body.minStockLevel !== undefined
      ? { minStockLevel: decimalValue(body.minStockLevel, 'Minimum stock', 4) }
      : {}),
    ...(body.isActive !== undefined ? { isActive: booleanValue(body.isActive) } : {}),
  };
}
@Injectable()
export class StoreProductsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(input: unknown, user: AuthenticatedUser) {
    const { query, search, status, page, pageSize } = listQuery(input, [
      'locationId',
      'categoryId',
    ]);
    const locationId = resolveLocationScope(
      user,
      query.locationId ? uuidValue(query.locationId) : undefined,
    );
    const where: Prisma.StoreProductWhereInput = {
      ...(locationId ? { locationId } : {}),
      location: { locationType: 'STORE', deletedAt: null },
      product: {
        deletedAt: null,
        ...(query.categoryId ? { categoryId: uuidValue(query.categoryId) } : {}),
        ...(user.role === 'STAFF' ? { isActive: true } : {}),
        ...(search
          ? {
              OR: ['sku', 'name', 'barcode'].map((key) => ({
                [key]: { contains: search, mode: 'insensitive' },
              })),
            }
          : {}),
      },
      ...(user.role === 'STAFF' || status === 'active'
        ? { isActive: true }
        : status === 'inactive'
          ? { OR: [{ isActive: false }, { isActive: null }] }
          : {}),
    };
    return this.prisma.$transaction(
      async (tx) => {
        const items = await tx.storeProduct.findMany({
          where,
          select: selection(user.role !== 'STAFF'),
          orderBy: [{ product: { sku: 'asc' } }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        });
        const total = await tx.storeProduct.count({ where });
        return { items, total, page, pageSize };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  private async scope(tx: Prisma.TransactionClient, user: AuthenticatedUser, requested?: string, adminOnly = false) {
    const current = await tx.user.findFirst({
      where: { id: user.id, isActive: true, deletedAt: null },
      include: { role: true },
    });
    if (!current || (current.role.code !== 'ADMIN' && current.role.code !== 'STORE_MANAGER'))
      throw new ForbiddenException('Store configuration access is no longer available.');
    if (adminOnly && current.role.code !== 'ADMIN') throw new ForbiddenException('Only administrators can assign or discontinue products.');
    return resolveLocationScope(
      { role: current.role.code, locationId: current.locationId },
      requested,
    );
  }
  private async validate(
    tx: Prisma.TransactionClient,
    locationId: string | null | undefined,
    productId: string | null | undefined,
    active: boolean,
  ) {
    if (
      !locationId ||
      !(await tx.location.findFirst({
        where: { id: locationId, locationType: 'STORE', isActive: true, deletedAt: null },
      }))
    )
      throw new BadRequestException('Select an active store. Warehouse pricing is not supported.');
    if (
      !productId ||
      !(await tx.product.findFirst({
        where: { id: productId, deletedAt: null, ...(active ? { isActive: true } : {}) },
      }))
    )
      throw new BadRequestException(
        'Select an active product before creating or activating a store configuration.',
      );
  }
  async create(input: unknown, user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Only administrators can assign products.');
    const data = parse(input, false);
    try {
      return await serializable(this.prisma,
        async (tx) => {
          const locationId = await this.scope(tx, user, data.locationId, true);
          await this.validate(tx, locationId, data.productId, true);
          const existing = await tx.storeProduct.findUnique({ where: { locationId_productId: { locationId: locationId!, productId: data.productId! } } });
          const defaults = existing
            ? { sellingPrice: existing.sellingPrice, minStockLevel: existing.minStockLevel, safetyStock: existing.safetyStock }
            : productDefaults(await tx.product.findUniqueOrThrow({ where: { id: data.productId! } }));
          if (existing && data.isActive === false)
            await confirmRemainingStock(tx, data.productId!, [locationId!], assignmentOptions(input as Record<string, unknown>).confirmDiscontinue);
          if (existing && data.isActive !== false && !existing.sellingPrice.greaterThan(0))
            throw new BadRequestException('Set a positive store price before activation.');
          const saved = await tx.storeProduct.upsert({
            where: { locationId_productId: { locationId: locationId!, productId: data.productId! } },
            update: { isActive: data.isActive ?? true },
            create: { ...defaults, ...data, locationId, sellingPrice: data.sellingPrice ?? defaults.sellingPrice },
          });
          return tx.storeProduct.findUniqueOrThrow({ where: { id: saved.id }, select: selection(true) });
        },
      );
    } catch (error) {
      databaseError(error, 'This product is already configured for this store.');
    }
  }
  async update(rawId: string, input: unknown, user: AuthenticatedUser) {
    const id = uuidValue(rawId);
    const data = parse(input, true);
    const options = assignmentOptions(input as Record<string, unknown>);
    const adminOnly = data.isActive !== undefined || (input as Record<string, unknown>).confirmDiscontinue !== undefined;
    if (user.role !== 'ADMIN' && adminOnly)
      throw new ForbiddenException('Managers can change only selling price, minimum stock and safety stock.');
    try {
      return await serializable(this.prisma,
        async (tx) => {
          const locationId = await this.scope(tx, user, undefined, adminOnly);
          const current = await tx.storeProduct.findFirst({
            where: { id, ...(locationId ? { locationId } : {}) },
          });
          if (!current) throw new NotFoundException('Store product not found.');
          if (current.isActive && data.isActive === false)
            await confirmRemainingStock(tx, current.productId!, [current.locationId!], options.confirmDiscontinue);
          if ((data.isActive ?? current.isActive) && !(data.sellingPrice ?? current.sellingPrice).greaterThan(0))
            throw new BadRequestException('A positive selling price is required.');
          await this.validate(
            tx,
            current.locationId,
            current.productId,
            data.isActive ?? current.isActive === true,
          );
          return tx.storeProduct.update({ where: { id }, data, select: selection(true) });
        },
      );
    } catch (error) {
      databaseError(error, 'This product is already configured for this store.');
    }
  }
  async batch(input: unknown, user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Only administrators can assign products.');
    const body = bodyObject(input, ['productId', 'storeIds', 'isGlobalAllStores', 'confirmDiscontinue', 'applyDefaultsToExisting']);
    const id = uuidValue(body.productId);
    const options = assignmentOptions(body);
    const global = booleanValue(body.isGlobalAllStores ?? false);
    try {
      return await serializable(this.prisma, async (tx) => {
        await this.scope(tx, user, undefined, true);
        const current = await tx.product.findFirst({ where: { id, isActive: true, deletedAt: null } });
        if (!current) throw new NotFoundException('Active product not found.');
        // Validate before updating the database constraint on global products.
        if (global && !current.defaultSellingPrice?.greaterThan(0))
          throw new BadRequestException({ code: 'DEFAULT_PRICE_REQUIRED', message: 'Set a positive default selling price before assigning this product.' });
        const product = await tx.product.update({ where: { id }, data: { isGlobalAllStores: global } });
        await syncAssignments(tx, product, options);
        return tx.storeProduct.findMany({ where: { productId: id }, select: selection(true), orderBy: { locationId: 'asc' } });
      });
    } catch (error) { databaseError(error); }
  }
}
