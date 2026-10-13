import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { money } from '../common/operations';

// The caller owns the serializable transaction that also persists the invoice.
export async function consumeStock(tx: Prisma.TransactionClient, locationId: string,
  product: { id: string; name: string; trackExpiry: boolean | null }, quantity: Prisma.Decimal, today: Date) {
  const lots = await tx.inventoryLot.findMany({ where: { locationId, productId: product.id, quantityOnHand: { gt: 0 },
    ...(product.trackExpiry ? { expiryDate: { gte: today } } : { OR: [{ expiryDate: null }, { expiryDate: { gte: today } }] }),
  }, orderBy: [...(product.trackExpiry ? [{ expiryDate: 'asc' as const }] : []), { receivedDate: 'asc' }, { id: 'asc' }] });
  const available = lots.reduce((sum, lot) => sum.add(lot.quantityOnHand), new Prisma.Decimal(0));
  if (available.lessThan(quantity)) throw new ConflictException({ code: 'INSUFFICIENT_STOCK', message: `Insufficient sellable stock for ${product.name}. Available: ${available.toFixed()}.` });
  let remaining = quantity; let cost = new Prisma.Decimal(0);
  for (const lot of lots) {
    if (remaining.isZero()) break;
    const consumed = Prisma.Decimal.min(remaining, lot.quantityOnHand);
    const updated = await tx.inventoryLot.updateMany({ where: { id: lot.id, quantityOnHand: { gte: consumed } }, data: { quantityOnHand: { decrement: consumed } } });
    if (updated.count !== 1) throw new ConflictException({ code: 'STOCK_CHANGED', message: 'Stock changed while completing the sale. Refresh and try again.' });
    remaining = remaining.sub(consumed); cost = cost.add(consumed.mul(lot.unitCost));
  }
  return money(cost, 'Cost of goods sold');
}
