import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { ImportType, RowError, SourceFile } from './import-file';
import { prepareProducts } from './product-import';
import { prepareSales } from './sale-import';
import { prepareInventory } from './inventory-import';
import { preparePurchases } from './purchase-import';
import { prepareExpenses } from './expense-import';

export type ImportWrite = { rows: number[] } & (
  { type: 'PRODUCT'; data: Omit<Prisma.ProductUncheckedCreateInput, 'createdAt'> } |
  { type: 'SALE'; data: Omit<Prisma.SaleUncheckedCreateInput, 'createdAt' | 'createdBy' | 'importJobId'> } |
  { type: 'INVENTORY'; data: Omit<Prisma.InventoryLotUncheckedCreateInput, 'createdAt'> } |
  { type: 'PURCHASE'; data: Omit<Prisma.PurchaseOrderUncheckedCreateInput, 'createdAt' | 'createdBy' | 'importJobId'> } |
  { type: 'EXPENSE'; data: Omit<Prisma.ExpenseUncheckedCreateInput, 'createdAt' | 'createdBy'> }
);
export type ImportPlan = { writes: ImportWrite[]; errors: RowError[] };

@Injectable()
export class ImportPlanner {
  async prepare(tx: Prisma.TransactionClient, type: ImportType, source: SourceFile): Promise<ImportPlan> {
    if (type === 'PRODUCT') return prepareProducts(tx, source);
    if (type === 'SALE') return prepareSales(tx, source);
    if (type === 'INVENTORY') return prepareInventory(tx, source);
    if (type === 'PURCHASE') return preparePurchases(tx, source);
    return prepareExpenses(tx, source);
  }
  async apply(tx: Prisma.TransactionClient, write: ImportWrite, userId: string, jobId: string) {
    const createdAt = new Date();
    switch (write.type) {
      case 'PRODUCT': await tx.product.create({ data: { ...write.data, createdAt } }); break;
      case 'INVENTORY': await tx.inventoryLot.create({ data: { ...write.data, createdAt } }); break;
      case 'SALE': await tx.sale.create({ data: { ...write.data, createdBy: userId, importJobId: jobId, createdAt } }); break;
      case 'PURCHASE': await tx.purchaseOrder.create({ data: { ...write.data, createdBy: userId, importJobId: jobId, createdAt } }); break;
      case 'EXPENSE': await tx.expense.create({ data: { ...write.data, createdBy: userId, createdAt } }); break;
    }
  }
}
