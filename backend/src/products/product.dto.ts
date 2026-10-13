import { BadRequestException } from '@nestjs/common';
import { bodyObject, booleanValue, optionalText, requiredText, uuidValue } from '../common/validation';
import { decimalValue } from '../common/decimal';

export function parseProduct(input: unknown, partial: boolean) {
  const body = bodyObject(input, ['sku', 'barcode', 'name', 'imageKey', 'categoryId', 'baseUnitId', 'purchaseUnitId', 'purchaseToBaseRatio', 'defaultCost', 'trackExpiry', 'shelfLifeDays', 'isActive']);
  if (body.imageKey !== undefined && body.imageKey !== null && (typeof body.imageKey !== 'string' || !['vegetables', 'fruit', 'meat', 'seafood', 'milk', 'drinks', 'rice', 'noodles', 'canned', 'eggs', 'bakery', 'household'].includes(body.imageKey))) {
    throw new BadRequestException('Select an available product illustration.');
  }
  if (partial && !Object.keys(body).length) throw new BadRequestException('Provide at least one field.');
  if (body.shelfLifeDays !== undefined && body.shelfLifeDays !== null &&
      (typeof body.shelfLifeDays !== 'number' || !Number.isInteger(body.shelfLifeDays) || body.shelfLifeDays < 0 || body.shelfLifeDays > 2147483647)) {
    throw new BadRequestException('Shelf life must be a non-negative whole number.');
  }
  return {
    ...(!partial || body.sku !== undefined ? { sku: requiredText(body.sku, 'SKU', 50) } : {}),
    ...(!partial || body.name !== undefined ? { name: requiredText(body.name, 'Name', 200) } : {}),
    ...(body.imageKey !== undefined ? { imageKey: body.imageKey as string | null } : {}),
    ...(body.barcode !== undefined ? { barcode: optionalText(body.barcode, 'Barcode', 100) } : {}),
    ...(!partial || body.categoryId !== undefined ? { categoryId: uuidValue(body.categoryId) } : {}),
    ...(!partial || body.baseUnitId !== undefined ? { baseUnitId: uuidValue(body.baseUnitId) } : {}),
    ...(!partial || body.purchaseUnitId !== undefined ? { purchaseUnitId: uuidValue(body.purchaseUnitId) } : {}),
    ...(body.purchaseToBaseRatio !== undefined ? { purchaseToBaseRatio: decimalValue(body.purchaseToBaseRatio, 'Purchase ratio', 4, true) } : {}),
    ...(body.defaultCost !== undefined ? { defaultCost: decimalValue(body.defaultCost, 'Default cost', 2) } : {}),
    ...(body.trackExpiry !== undefined ? { trackExpiry: booleanValue(body.trackExpiry) } : {}),
    ...(body.shelfLifeDays !== undefined ? { shelfLifeDays: body.shelfLifeDays as number | null } : {}),
    ...(body.isActive !== undefined ? { isActive: booleanValue(body.isActive) } : {}),
  };
}
