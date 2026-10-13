import { Prisma } from '../../generated/prisma/client';
import { decimalValue } from '../common/decimal';
import { businessDate } from '../inventory/expiry';

export function recommendedQuantity(predicted: Prisma.Decimal, safety: Prisma.Decimal, current: Prisma.Decimal, incoming: Prisma.Decimal) {
  return decimalValue(Prisma.Decimal.max(0, predicted.add(safety).sub(current).sub(incoming)).toFixed(), 'Recommended quantity', 4);
}

export async function stockSnapshot(tx: Prisma.TransactionClient, locationId: string, productId: string, trackExpiry: boolean, today = businessDate()) {
  const lots = await tx.inventoryLot.findMany({ where: { locationId, productId, quantityOnHand: { gt: 0 } } });
  const usable = lots.filter(l => l.expiryDate ? l.expiryDate.toISOString().slice(0,10) >= today : !trackExpiry);
  const provisional = await tx.purchaseOrderItem.aggregate({ where: { productId, purchaseOrder: { locationId, status: 'DRAFT', importJobId: null } }, _sum: { baseQuantity: true } });
  return {
    current: decimalValue(usable.reduce((sum,l) => sum.add(l.quantityOnHand), new Prisma.Decimal(0)).toFixed(), 'Usable stock', 4),
    // DRAFT is an unconfirmed intention; there is no confirmed/ETA state in this MVP.
    incoming: new Prisma.Decimal(0), provisionalIncoming: provisional._sum.baseQuantity ?? new Prisma.Decimal(0), lots,
  };
}
