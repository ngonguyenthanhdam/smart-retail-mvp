import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { decimalValue } from '../common/decimal';
import { money } from '../common/operations';
import { requiredText } from '../common/validation';
import type { SourceFile } from './import-file';
import type { ImportPlan, ImportWrite } from './import-plan';
import { documentGroups } from './document-import';
import { errorRows, importTimestamp, sourceLocation, sourceProduct, validationError } from './import-validation';

export async function prepareSales(tx: Prisma.TransactionClient, source: SourceFile): Promise<ImportPlan> {
  const errors = new Map<number, string>(); const writes: ImportWrite[] = [];
  for (const group of documentGroups(source, 'sale_reference')) {
    try {
      if (group.length > 100) throw new BadRequestException('Each invoice may contain at most 100 lines.');
      const first = group[0]!.values; const invoiceNumber = requiredText(first.sale_reference, 'Sale reference', 50);
      if (await tx.sale.findUnique({ where: { invoiceNumber } })) throw new BadRequestException('Sale reference already exists.');
      const location = await sourceLocation(tx, first.store_code, true);
      const soldAt = importTimestamp(first.sale_date, 'Sale date');
      const discountAmount = decimalValue(first.discount_amount || '0', 'Invoice discount', 2);
      const items = [];
      for (const row of group) {
        if (row.error) throw new BadRequestException(`Row ${row.row}: ${row.error}`);
        const v = row.values;
        if (v.store_code !== first.store_code || importTimestamp(v.sale_date, 'Sale date').getTime() !== soldAt.getTime() ||
            !decimalValue(v.discount_amount || '0', 'Invoice discount', 2).equals(discountAmount)) throw new BadRequestException('All invoice lines must have the same store, date and invoice discount.');
        const product = await sourceProduct(tx, v.product_sku);
        const quantity = decimalValue(v.quantity, 'Quantity', 4, true); const unitPrice = decimalValue(v.unit_price, 'Unit price', 2);
        const costOfGoodsSold = decimalValue(v.cost_of_goods_sold, 'Total line COGS', 2);
        items.push({ productId: product.id, quantity, unitPrice, costOfGoodsSold, discountAmount: new Prisma.Decimal(0), promotionFlag: false, lineTotal: money(quantity.mul(unitPrice), 'Line total') });
      }
      const subtotal = money(items.reduce((sum, item) => sum.add(item.lineTotal), new Prisma.Decimal(0)), 'Subtotal');
      if (discountAmount.gt(subtotal)) throw new BadRequestException('Invoice discount cannot exceed subtotal.');
      writes.push({ type: 'SALE', rows: group.map((r) => r.row), data: { invoiceNumber, locationId: location.id, soldAt, status: 'COMPLETED', subtotal, discountAmount, totalAmount: subtotal.sub(discountAmount), items: { create: items } } });
    } catch (error) {
      const message = `Entire invoice rejected: ${validationError(error)}`;
      for (const row of group) errors.set(row.row, message);
    }
  }
  return { writes, errors: errorRows(errors) };
}
