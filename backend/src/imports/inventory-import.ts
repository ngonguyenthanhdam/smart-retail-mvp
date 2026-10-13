import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { decimalValue } from '../common/decimal';
import { dateValue } from '../common/operations';
import { requiredText } from '../common/validation';
import type { SourceFile } from './import-file';
import type { ImportPlan, ImportWrite } from './import-plan';
import { errorRows, sourceErrors, sourceLocation, sourceProduct, validationError } from './import-validation';

export async function prepareInventory(tx: Prisma.TransactionClient, source: SourceFile): Promise<ImportPlan> {
  const errors = sourceErrors(source); const writes: ImportWrite[] = [];
  const lotKey = (v: Record<string, string>) => JSON.stringify([v.store_code,v.product_sku,v.lot_number]);
  const counts = new Map<string, number>();
  for (const row of source.rows) counts.set(lotKey(row.values), (counts.get(lotKey(row.values)) ?? 0) + 1);
  for (const row of source.rows) {
    if (errors.has(row.row)) continue;
    try {
      const v = row.values;
      if (counts.get(lotKey(v))! > 1) throw new BadRequestException('Duplicate lot number for this store/product in the file.');
      const location = await sourceLocation(tx, v.store_code, true, true); const product = await sourceProduct(tx, v.product_sku, true);
      if (await tx.inventoryLot.count({ where: { locationId: location.id, productId: product.id } })) throw new BadRequestException('Opening inventory rejected: this store/product already has inventory lots.');
      const receivedDate = dateValue(v.received_date, 'Received date'); const expiryDate = v.expiry_date ? dateValue(v.expiry_date, 'Expiry date') : null;
      if ((product.trackExpiry && !expiryDate) || (expiryDate && expiryDate < receivedDate)) throw new BadRequestException('Tracked stock requires expiry; expiry cannot precede receipt.');
      writes.push({ type: 'INVENTORY', rows: [row.row], data: { locationId: location.id, productId: product.id,
        lotNumber: requiredText(v.lot_number, 'Lot number', 100), quantityOnHand: decimalValue(v.quantity_on_hand, 'Opening quantity', 4),
        unitCost: decimalValue(v.unit_cost, 'Cost per base unit', 2), receivedDate, expiryDate, purchaseOrderItemId: null } });
    } catch (error) { errors.set(row.row, validationError(error)); }
  }
  return { writes, errors: errorRows(errors) };
}
