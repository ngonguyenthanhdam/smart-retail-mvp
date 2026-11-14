import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { databaseError, serializable } from '../common/database-errors';
import { assignmentOptions, confirmRemainingStock, productDefaults, syncAssignments } from '../store-products/assignment';
import { ProductImages } from './product-images';
import { listQuery, uuidValue } from '../common/validation';
import { parseProduct } from './product.dto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';

export const productSelect = {
  id: true,
  sku: true,
  barcode: true,
  name: true,
  imageKey: true,
  imagePath: true,
  defaultSellingPrice: true,
  defaultMinStockLevel: true,
  defaultSafetyStock: true,
  isGlobalAllStores: true,
  categoryId: true,
  baseUnitId: true,
  purchaseUnitId: true,
  purchaseToBaseRatio: true,
  trackExpiry: true,
  shelfLifeDays: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, code: true, name: true } },
  baseUnit: { select: { id: true, code: true, name: true, symbol: true, allowFraction: true } },
  purchaseUnit: { select: { id: true, code: true, name: true, symbol: true } },
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly images: ProductImages) {}
  async image(filename: string, user: AuthenticatedUser) {
    const locationId = resolveLocationScope(user);
    const path = `/products/images/${filename}`;
    const product = await this.prisma.product.findFirst({
      where: { imagePath: path, deletedAt: null,
        ...(user.role === 'STAFF' ? { isActive: true } : {}),
        ...(user.role !== 'ADMIN' ? { storeProducts: { some: { locationId, ...(user.role === 'STAFF' ? { isActive: true } : {}) } } } : {}),
      }, select: { id: true },
    });
    if (!product) throw new NotFoundException('Image not found.');
    return this.images.read(path);
  }
  async list(input: unknown, user: AuthenticatedUser) {
    const { query, search, status, page, pageSize } = listQuery(input, ['categoryId', 'available']);
    if (query.available !== undefined && query.available !== 'true')
      throw new BadRequestException('Available must be true when provided.');
    const available = query.available === 'true';
    if (available && user.role === 'STAFF')
      throw new ForbiddenException('Global product selection requires store management access.');
    const locationId = resolveLocationScope(user);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.categoryId ? { categoryId: uuidValue(query.categoryId) } : {}),
      ...(status === 'active'
        ? { isActive: true }
        : status === 'inactive'
          ? { OR: [{ isActive: false }, { isActive: null }] }
          : {}),
      ...(search
        ? {
            AND: [
              {
                OR: ['sku', 'name', 'barcode'].map((key) => ({
                  [key]: { contains: search, mode: 'insensitive' },
                })),
              },
            ],
          }
        : {}),
      ...(available || user.role === 'STAFF' ? { isActive: true } : {}),
      ...(user.role !== 'ADMIN' && !available
        ? {
            storeProducts: {
              some: { locationId, ...(user.role === 'STAFF' ? { isActive: true } : {}) },
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.product.findMany({
          where,
          select: {
            ...productSelect,
            ...(user.role !== 'STAFF'
              ? { defaultCost: true }
              : {}),
          },
          orderBy: [{ sku: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.product.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const options = available ? items.map(({ defaultCost, ...product }) => {
      const cost = defaultCost != null && product.purchaseToBaseRatio != null
        ? defaultCost.mul(product.purchaseToBaseRatio).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : null;
      return {
        ...product,
        ...(user.role === 'ADMIN' ? { defaultCost } : {}),
        suggestedUnitCost: cost?.lte('999999999999.99') ? cost.toString() : null,
      };
    }) : items;
    return { items: options, total, page, pageSize };
  }
  async detail(rawId: string, user: AuthenticatedUser) {
    const locationId = resolveLocationScope(user);
    const row = await this.prisma.product.findFirst({
      where: {
        id: uuidValue(rawId),
        deletedAt: null,
        ...(user.role !== 'ADMIN'
          ? {
              storeProducts: {
                some: { locationId, ...(user.role === 'STAFF' ? { isActive: true } : {}) },
              },
            }
          : {}),
        ...(user.role === 'STAFF' ? { isActive: true } : {}),
      },
      select: { ...productSelect, ...(user.role !== 'STAFF' ? { defaultCost: true } : {}),
        ...(user.role === 'ADMIN' ? { storeProducts: { select: { locationId: true, isActive: true } } } : {}),
      },
    });
    if (!row) throw new NotFoundException('Product not found.');
    return row;
  }
  private async validateRelations(
    tx: Prisma.TransactionClient,
    data: {
      categoryId?: string | null;
      baseUnitId?: string | null;
      purchaseUnitId?: string | null;
      isActive?: boolean | null;
    },
  ) {
    const category =
      data.categoryId && (await tx.category.findUnique({ where: { id: data.categoryId } }));
    if (!category) throw new BadRequestException('Select a category.');
    if (data.isActive !== false && !category.isActive)
      throw new ConflictException('An active product requires an active category.');
    for (const id of [data.baseUnitId, data.purchaseUnitId]) {
      if (!id || !(await tx.unit.findUnique({ where: { id } })))
        throw new BadRequestException('Select valid base and purchase units.');
    }
  }
  async create(input: unknown, file?: Express.Multer.File) {
    const data = parseProduct(input, false);
    const options = assignmentOptions(input as Record<string, unknown>);
    if (!data.defaultSellingPrice) throw new BadRequestException({ code: 'DEFAULT_PRICE_REQUIRED', message: 'A positive default selling price is required.' });
    const image = file ? await this.images.save(file) : undefined;
    try {
      return await serializable(this.prisma,
        async (tx) => {
          await this.validateRelations(tx, data);
          const product = await tx.product.create({
            data: { ...data, ...(image ? { imagePath: image.path } : {}), sku: data.sku!, name: data.name!, createdAt: new Date() },
          });
          if (product.isGlobalAllStores || options.storeIds?.length)
            await syncAssignments(tx, product, options);
          return tx.product.findUniqueOrThrow({ where: { id: product.id }, select: { ...productSelect, defaultCost: true } });
        },
      );
    } catch (error) {
      if (image) await this.images.removeUncommitted(image.path);
      databaseError(error, 'This SKU or barcode is already in use.');
    }
  }
  async update(rawId: string, input: unknown, file?: Express.Multer.File) {
    const id = uuidValue(rawId);
    const data = parseProduct(input, true);
    const options = assignmentOptions(input as Record<string, unknown>);
    const image = file ? await this.images.save(file) : undefined;
    try {
      return await serializable(this.prisma,
        async (tx) => {
          const current = await tx.product.findFirst({ where: { id, deletedAt: null } });
          if (!current) throw new NotFoundException('Product not found.');
          const baseChanged =
            data.baseUnitId !== undefined && data.baseUnitId !== current.baseUnitId;
          const purchaseChanged =
            data.purchaseUnitId !== undefined && data.purchaseUnitId !== current.purchaseUnitId;
          if (
            ((baseChanged || purchaseChanged) &&
              (await tx.purchaseOrderItem.count({ where: { productId: id } }))) ||
            (baseChanged && (await tx.saleItem.count({ where: { productId: id } })))
          ) {
            throw new ConflictException(
              'Units cannot change after related transaction history exists.',
            );
          }
          if (
            data.baseUnitId !== undefined &&
            data.baseUnitId !== current.baseUnitId &&
            (await tx.inventoryLot.count({ where: { productId: id } }))
          ) {
            throw new ConflictException('The base unit cannot change after inventory lots exist.');
          }
          if (
            data.trackExpiry === true &&
            (await tx.inventoryLot.count({ where: { productId: id, expiryDate: null } }))
          ) {
            throw new ConflictException(
              'All existing lots require expiry dates before enabling expiry tracking.',
            );
          }
          await this.validateRelations(tx, { ...current, ...data });
          if (data.isGlobalAllStores ?? current.isGlobalAllStores)
            productDefaults({ ...current, ...data });
          if (current.isActive && data.isActive === false)
            await confirmRemainingStock(tx, id, undefined, options.confirmDiscontinue);
          const product = await tx.product.update({
            where: { id },
            data: { ...data, ...(image ? { imagePath: image.path } : {}) },
          });
          if (product.isActive && (options.storeIds !== undefined || data.isGlobalAllStores !== undefined ||
              (product.isGlobalAllStores && !current.isActive))) {
            await syncAssignments(tx, product, options);
          } else if (!product.isActive && (options.storeIds?.length || data.isGlobalAllStores === true)) {
            throw new BadRequestException('Only active products can be assigned.');
          }
          return tx.product.findUniqueOrThrow({ where: { id }, select: { ...productSelect, defaultCost: true } });
        },
      );
    } catch (error) {
      if (image) await this.images.removeUncommitted(image.path);
      databaseError(error, 'This SKU or barcode is already in use.');
    }
  }
}
