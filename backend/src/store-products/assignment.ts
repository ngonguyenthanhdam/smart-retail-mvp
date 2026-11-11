import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, type Product } from '../../generated/prisma/client';
import { booleanValue, uuidValue } from '../common/validation';

export function assignmentOptions(body: Record<string, unknown>) {
  if (body.storeIds !== undefined && (!Array.isArray(body.storeIds) || body.storeIds.length > 10000))
    throw new BadRequestException('Store IDs must be an array of at most 10000 stores.');
  return {
    storeIds: body.storeIds === undefined ? undefined : [...new Set((body.storeIds as unknown[]).map(uuidValue))],
    confirmDiscontinue: body.confirmDiscontinue === undefined ? false : booleanValue(body.confirmDiscontinue),
    applyDefaultsToExisting: body.applyDefaultsToExisting === undefined ? false : booleanValue(body.applyDefaultsToExisting),
  };
}

export function productDefaults(product: Product) {
  if (!product.defaultSellingPrice?.greaterThan(0))
    throw new BadRequestException({ code: 'DEFAULT_PRICE_REQUIRED', message: 'Set a positive default selling price before assigning this product.' });
  return {
    sellingPrice: product.defaultSellingPrice,
    minStockLevel: product.defaultMinStockLevel,
    safetyStock: product.defaultSafetyStock,
  };
}

export async function confirmRemainingStock(
  tx: Prisma.TransactionClient,
  productId: string,
  locationIds: string[] | undefined,
  confirmed: boolean,
) {
  const stock = await tx.inventoryLot.groupBy({
    by: ['locationId'],
    where: { productId, quantityOnHand: { gt: 0 }, ...(locationIds ? { locationId: { in: locationIds } } : {}) },
    _sum: { quantityOnHand: true },
  });
  if (stock.length && !confirmed) {
    const locations = await tx.location.findMany({ where: { id: { in: stock.flatMap((s) => s.locationId ? [s.locationId] : []) } }, select: { id: true, name: true } });
    throw new ConflictException({
      code: 'STOCK_REMAINS_CONFIRMATION_REQUIRED',
      message: 'Stock remains. Confirm discontinuation; physical stock and transaction history will be preserved.',
      stock: stock.map((s) => ({ locationId: s.locationId, locationName: locations.find((l) => l.id === s.locationId)?.name, quantity: s._sum.quantityOnHand?.toString() ?? '0' })),
    });
  }
}

export async function assignAtStore(tx: Prisma.TransactionClient, product: Product, locationId: string, applyDefaults = false) {
  const current = await tx.storeProduct.findUnique({ where: { locationId_productId: { locationId, productId: product.id } } });
  if (current) {
    if (!applyDefaults && !current.sellingPrice.greaterThan(0))
      throw new BadRequestException('Set a positive store price or explicitly apply the product defaults before activation.');
    return tx.storeProduct.update({ where: { id: current.id }, data: { isActive: true, ...(applyDefaults ? productDefaults(product) : {}) } });
  }
  return tx.storeProduct.upsert({
    where: { locationId_productId: { locationId, productId: product.id } },
    update: { isActive: true },
    create: { locationId, productId: product.id, ...productDefaults(product) },
  });
}

// The caller owns the transaction. Assignment never creates or modifies inventory.
export async function syncAssignments(tx: Prisma.TransactionClient, product: Product, options: ReturnType<typeof assignmentOptions>) {
  if (!product.isActive || product.deletedAt) throw new BadRequestException('Only active products can be assigned.');
  if (!product.isGlobalAllStores && options.storeIds === undefined)
    throw new BadRequestException('Select stores when disabling All Stores.');
  if (product.isGlobalAllStores) productDefaults(product);
  const stores = await tx.location.findMany({
    where: { locationType: 'STORE', isActive: true, deletedAt: null, ...(!product.isGlobalAllStores ? { id: { in: options.storeIds! } } : {}) },
    select: { id: true }, orderBy: { id: 'asc' },
  });
  if (!product.isGlobalAllStores && stores.length !== options.storeIds!.length)
    throw new BadRequestException('Select active stores only.');
  const selected = stores.map((s) => s.id);
  const removed = await tx.storeProduct.findMany({
    where: { productId: product.id, isActive: true, locationId: { notIn: selected }, ...(!product.isGlobalAllStores ? {} : { location: { isActive: true, deletedAt: null } }) },
    select: { id: true, locationId: true },
  });
  await confirmRemainingStock(tx, product.id, removed.flatMap((s) => s.locationId ? [s.locationId] : []), options.confirmDiscontinue);
  await tx.storeProduct.updateMany({ where: { id: { in: removed.map((s) => s.id) } }, data: { isActive: false } });
  for (const store of stores) await assignAtStore(tx, product, store.id, options.applyDefaultsToExisting);
}

export async function assignGlobalProducts(tx: Prisma.TransactionClient, locationId: string) {
  const products = await tx.product.findMany({ where: { isActive: true, deletedAt: null, isGlobalAllStores: true }, orderBy: { id: 'asc' } });
  for (const product of products) await assignAtStore(tx, product, locationId);
}
