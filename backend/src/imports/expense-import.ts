import type { Prisma } from '../../generated/prisma/client';
import { decimalValue } from '../common/decimal';
import { dateValue } from '../common/operations';
import { choiceValue, optionalText } from '../common/validation';
import type { SourceFile } from './import-file';
import type { ImportPlan, ImportWrite } from './import-plan';
import { errorRows, sourceErrors, sourceLocation, validationError } from './import-validation';

export async function prepareExpenses(tx: Prisma.TransactionClient, source: SourceFile): Promise<ImportPlan> {
  const errors = sourceErrors(source); const writes: ImportWrite[] = [];
  for (const row of source.rows) {
    if (errors.has(row.row)) continue;
    try {
      const v = row.values; const location = v.location_code ? await sourceLocation(tx, v.location_code) : null;
      writes.push({ type: 'EXPENSE', rows: [row.row], data: { locationId: location?.id ?? null,
        expenseType: choiceValue(v.expense_type, ['RENT','SALARY','ELECTRICITY','WATER','TRANSPORT','MARKETING','OTHER'], 'Expense type'),
        amount: decimalValue(v.amount, 'Amount', 2), expenseDate: dateValue(v.expense_date, 'Expense date'), description: optionalText(v.description || null, 'Description', 4000) } });
    } catch (error) { errors.set(row.row, validationError(error)); }
  }
  return { writes, errors: errorRows(errors) };
}
