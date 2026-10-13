import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { decimalValue } from '../common/decimal';
import { dateValue, money } from '../common/operations';
import { choiceValue, optionalText, requiredText } from '../common/validation';
import { businessDate } from '../inventory/expiry';
import type { SourceFile } from './import-file';
import type { ImportPlan, ImportWrite } from './import-plan';
import { documentGroups } from './document-import';
import { errorRows, importTimestamp, sourceLocation, sourceProduct, validationError } from './import-validation';

export async function preparePurchases(tx: Prisma.TransactionClient, source: SourceFile): Promise<ImportPlan> {
  const errors = new Map<number, string>(); const writes: ImportWrite[] = [];
  for (const group of documentGroups(source, 'purchase_reference')) {
    try {
      if (group.length > 100) throw new BadRequestException('Each purchase may contain at most 100 lines.');
      const first = group[0]!.values; const orderNumber = requiredText(first.purchase_reference, 'Purchase reference', 50);
      if (await tx.purchaseOrder.findUnique({ where: { orderNumber } })) throw new BadRequestException('Purchase reference already exists.');
      const status = choiceValue(first.status, ['RECEIVED','CANCELLED'], 'Historical purchase status');
      const location = await sourceLocation(tx, first.location_code);
      const orderedAt = importTimestamp(first.ordered_at, 'Order date');
      const receivedAt = first.received_at ? importTimestamp(first.received_at, 'Receipt date') : null;
      if ((status === 'RECEIVED' && !receivedAt) || (status === 'CANCELLED' && receivedAt) || (receivedAt && receivedAt < orderedAt)) throw new BadRequestException('RECEIVED requires a receipt date on/after order date; CANCELLED must not have a receipt date.');
      const items = [];
      for (const row of group) {
        if (row.error) throw new BadRequestException(`Row ${row.row}: ${row.error}`);
        const v = row.values;
        if (v.location_code !== first.location_code || v.status !== status || importTimestamp(v.ordered_at, 'Order date').getTime() !== orderedAt.getTime() ||
            (v.received_at ? importTimestamp(v.received_at, 'Receipt date').getTime() : null) !== (receivedAt?.getTime() ?? null)) throw new BadRequestException('All purchase lines must have the same location, status, order date and receipt date.');
        const product = await sourceProduct(tx, v.product_sku);
        const purchaseQuantity = decimalValue(v.purchase_quantity, 'Purchase quantity', 4, true);
        const baseQuantity = v.base_quantity ? decimalValue(v.base_quantity, 'Source base quantity', 4, true) :
          status === 'CANCELLED' && product.purchaseToBaseRatio ? decimalValue(purchaseQuantity.mul(product.purchaseToBaseRatio).toFixed(), 'Cancelled base quantity', 4, true) : null;
        if (!baseQuantity) throw new BadRequestException('RECEIVED requires base_quantity from the source file.');
        const unitCost = decimalValue(v.unit_cost, 'Cost per purchase unit', 2);
        const expiryDate = v.expiry_date ? dateValue(v.expiry_date, 'Expiry date') : null;
        if (status === 'RECEIVED' && product.trackExpiry && !expiryDate) throw new BadRequestException('Received tracked products require expiry_date.');
        if (expiryDate && receivedAt && expiryDate.toISOString().slice(0, 10) < businessDate(receivedAt)) throw new BadRequestException('Expiry cannot precede receipt.');
        items.push({ productId: product.id, purchaseQuantity, baseQuantity, unitCost, expiryDate,
          lotNumber: optionalText(v.lot_number || null, 'Lot number', 100), lineTotal: money(purchaseQuantity.mul(unitCost), 'Line total') });
      }
      const totalCost = money(items.reduce((sum, item) => sum.add(item.lineTotal), new Prisma.Decimal(0)), 'Total cost');
      writes.push({ type: 'PURCHASE', rows: group.map((r) => r.row), data: { orderNumber, locationId: location.id, orderedAt, receivedAt, status, totalCost, items: { create: items } } });
    } catch (error) {
      const message = `Entire purchase rejected: ${validationError(error)}`;
      for (const row of group) errors.set(row.row, message);
    }
  }
  return { writes, errors: errorRows(errors) };
}
