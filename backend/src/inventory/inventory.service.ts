import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { listQuery, uuidValue } from '../common/validation';
import { businessDate, expiryStatus } from './expiry';

type BalanceRow = {
  locationId: string; locationCode: string; locationName: string; locationType: string;
  productId: string; sku: string; productName: string; categoryId: string | null; categoryName: string | null;
  baseUnitCode: string | null; imageKey: string | null; currentQuantity: string; sellableQuantity: string; sellingPrice: string | null; safetyStock: string | null; minStockLevel: string | null;
  lowStock: boolean; trackExpiry: boolean | null; earliestExpiry: string | null;
};
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  async list(input: unknown, user: AuthenticatedUser) {
    const { query, search, page, pageSize } = listQuery(input, ['locationId', 'productId', 'categoryId', 'lowStock']);
    const locationId = resolveLocationScope(user, query.locationId ? uuidValue(query.locationId) : undefined);
    const productId = query.productId ? uuidValue(query.productId) : undefined;
    const categoryId = query.categoryId ? uuidValue(query.categoryId) : undefined;
    if (query.lowStock !== undefined && !['true', 'false'].includes(String(query.lowStock))) throw new BadRequestException('Low stock must be true or false.');
    const conditions = [Prisma.sql`l.deleted_at IS NULL`, Prisma.sql`p.deleted_at IS NULL`];
    if (locationId) conditions.push(Prisma.sql`k.location_id = ${locationId}::uuid`);
    if (productId) conditions.push(Prisma.sql`k.product_id = ${productId}::uuid`);
    if (categoryId) conditions.push(Prisma.sql`p.category_id = ${categoryId}::uuid`);
    if (search) conditions.push(Prisma.sql`(p.sku ILIKE ${'%' + search.replace(/[\\%_]/g, '\\$&') + '%'} OR p.name ILIKE ${'%' + search.replace(/[\\%_]/g, '\\$&') + '%'})`);
    if (query.lowStock === 'true') conditions.push(Prisma.sql`l.location_type = 'STORE' AND sp.id IS NOT NULL AND COALESCE(b.current_quantity,0) <= COALESCE(sp.min_stock_level,0)`);
    if (user.role === 'STAFF') conditions.push(Prisma.sql`sp.is_active = true AND p.is_active = true`);
    const from = Prisma.sql`
      FROM (SELECT location_id, product_id FROM v_inventory_balance UNION SELECT location_id, product_id FROM store_products) k
      JOIN locations l ON l.id = k.location_id JOIN products p ON p.id = k.product_id
      LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN units u ON u.id = p.base_unit_id
      LEFT JOIN v_inventory_balance b ON b.location_id = k.location_id AND b.product_id = k.product_id
      LEFT JOIN store_products sp ON sp.location_id = k.location_id AND sp.product_id = k.product_id
      WHERE ${Prisma.join(conditions, ' AND ')}`;
    const today = businessDate(); const warningDays = this.config.getOrThrow<number>('INVENTORY_EXPIRY_WARNING_DAYS');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<BalanceRow[]>(Prisma.sql`SELECT
        l.id AS "locationId", l.code AS "locationCode", l.name AS "locationName", l.location_type AS "locationType",
        p.id AS "productId", p.sku, p.name AS "productName", p.image_key AS "imageKey", p.category_id AS "categoryId", c.name AS "categoryName", u.code AS "baseUnitCode",
        COALESCE(b.current_quantity,0)::text AS "currentQuantity", sp.selling_price::text AS "sellingPrice", sp.safety_stock::text AS "safetyStock", sp.min_stock_level::text AS "minStockLevel",
        (SELECT COALESCE(SUM(il.quantity_on_hand),0)::text FROM inventory_lots il
         WHERE il.location_id=l.id AND il.product_id=p.id AND il.quantity_on_hand>0
           AND (il.expiry_date >= ${today}::date OR (il.expiry_date IS NULL AND COALESCE(p.track_expiry,false)=false))) AS "sellableQuantity",
        (sp.id IS NOT NULL AND COALESCE(b.current_quantity,0) <= COALESCE(sp.min_stock_level,0)) AS "lowStock", p.track_expiry AS "trackExpiry",
        (SELECT MIN(il.expiry_date)::text FROM inventory_lots il WHERE il.location_id = l.id AND il.product_id = p.id AND il.quantity_on_hand > 0) AS "earliestExpiry"
        ${from} ORDER BY l.code, p.sku, l.id, p.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
      const totals = await tx.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS total ${from}`);
      return { items: rows.map((row) => ({ ...row, expiryStatus: expiryStatus(row.trackExpiry, row.earliestExpiry, today, warningDays) })), total: totals[0]!.total, page, pageSize, businessDate: today, expiryWarningDays: warningDays };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async lots(rawLocationId: string, rawProductId: string, user: AuthenticatedUser) {
    const locationId = uuidValue(rawLocationId); const productId = uuidValue(rawProductId);
    resolveLocationScope(user, locationId);
    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.findFirst({ where: { id: locationId, deletedAt: null }, select: { id: true, code: true, name: true } });
      const product = await tx.product.findFirst({ where: { id: productId, deletedAt: null,
        ...(user.role === 'STAFF' ? { isActive: true, storeProducts: { some: { locationId, isActive: true } } } : {}),
      }, select: { id: true, sku: true, name: true, trackExpiry: true, baseUnit: { select: { code: true } } } });
      if (!location || !product) throw new NotFoundException('Inventory not found.');
      const lots = await tx.inventoryLot.findMany({ where: { locationId, productId },
        select: { id: true, lotNumber: true, quantityOnHand: true, receivedDate: true, expiryDate: true, ...(user.role !== 'STAFF' ? { unitCost: true } : {}) },
        orderBy: [...(product.trackExpiry ? [{ expiryDate: { sort: 'asc' as const, nulls: 'last' as const } }] : []), { receivedDate: 'asc' }, { id: 'asc' }],
      });
      if (!lots.length && !await tx.storeProduct.count({ where: { locationId, productId } })) throw new NotFoundException('Inventory not found.');
      const today = businessDate(); const warningDays = this.config.getOrThrow<number>('INVENTORY_EXPIRY_WARNING_DAYS');
      return { location, product, ordering: product.trackExpiry ? 'FEFO' : 'FIFO', businessDate: today, expiryWarningDays: warningDays,
        items: lots.map((lot) => ({ ...lot, receivedDate: lot.receivedDate.toISOString().slice(0, 10), expiryDate: lot.expiryDate?.toISOString().slice(0, 10) ?? null,
          expiryStatus: expiryStatus(product.trackExpiry, lot.expiryDate?.toISOString().slice(0, 10) ?? null, today, warningDays) })),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
