import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { parseProduct } from '../products/product.dto';
import type { SourceFile } from './import-file';
import type { ImportPlan, ImportWrite } from './import-plan';
import { booleanCell, errorRows, sourceErrors, validationError } from './import-validation';

export async function prepareProducts(tx: Prisma.TransactionClient, source: SourceFile): Promise<ImportPlan> {
  const errors = sourceErrors(source, ['sku', 'barcode']); const writes: ImportWrite[] = [];
  for (const row of source.rows) {
    if (errors.has(row.row)) continue;
    try {
      const v = row.values;
      const category = v.category_code && await tx.category.findUnique({ where: { code: v.category_code } });
      const base = v.base_unit_code && await tx.unit.findUnique({ where: { code: v.base_unit_code } });
      const purchase = v.purchase_unit_code && await tx.unit.findUnique({ where: { code: v.purchase_unit_code } });
      if (!category || !base || !purchase) throw new BadRequestException('Unknown category or unit code.');
      const isActive = booleanCell(v.is_active, true);
      if (isActive && !category.isActive) throw new BadRequestException('An active product requires an active category.');
      if (v.shelf_life_days && !/^\d+$/.test(v.shelf_life_days)) throw new BadRequestException('Shelf life must be a nonnegative whole number.');
      const data = parseProduct({ sku: v.sku, name: v.name, barcode: v.barcode || null, categoryId: category.id,
        baseUnitId: base.id, purchaseUnitId: purchase.id, purchaseToBaseRatio: v.purchase_to_base_ratio || '1', defaultCost: v.default_cost || '0',
        trackExpiry: booleanCell(v.track_expiry, false), shelfLifeDays: v.shelf_life_days ? Number(v.shelf_life_days) : null, isActive }, false);
      if (await tx.product.findFirst({ where: { OR: [{ sku: data.sku! }, ...(data.barcode ? [{ barcode: data.barcode }] : [])] } })) throw new BadRequestException('SKU or barcode already exists.');
      writes.push({ rows: [row.row], type: 'PRODUCT', data: { ...data, sku: data.sku!, name: data.name! } });
    } catch (error) { errors.set(row.row, validationError(error)); }
  }
  return { writes, errors: errorRows(errors) };
}
