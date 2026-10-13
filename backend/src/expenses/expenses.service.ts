import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { bodyObject, choiceValue, optionalText, uuidValue } from '../common/validation';
import { decimalValue } from '../common/decimal';
import { databaseError } from '../common/database-errors';
import { activeLocation, creatorSelect, dateValue, locationSelect, operationQuery, writeActor } from '../common/operations';

const expenseTypes = ['RENT', 'SALARY', 'ELECTRICITY', 'WATER', 'TRANSPORT', 'MARKETING', 'OTHER'] as const;
const select = { id: true, locationId: true, expenseType: true, amount: true, expenseDate: true, description: true, createdAt: true, updatedAt: true,
  location: { select: locationSelect }, creator: { select: creatorSelect } } as const;
function parse(input: unknown, partial: boolean) {
  const body = bodyObject(input, ['locationId', 'expenseType', 'amount', 'expenseDate', 'description']);
  if (!Object.keys(body).length) throw new BadRequestException('Provide at least one field.');
  return {
    ...(body.locationId !== undefined ? { locationId: body.locationId === null ? null : uuidValue(body.locationId) } : {}),
    ...(!partial || body.expenseType !== undefined ? { expenseType: choiceValue(body.expenseType, expenseTypes, 'Expense type') } : {}),
    ...(!partial || body.amount !== undefined ? { amount: decimalValue(body.amount, 'Amount', 2) } : {}),
    ...(!partial || body.expenseDate !== undefined ? { expenseDate: dateValue(body.expenseDate, 'Expense date') } : {}),
    ...(body.description !== undefined ? { description: optionalText(body.description, 'Description', 4000) } : {}),
  };
}
@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}
  async list(input: unknown, user: AuthenticatedUser) {
    const q = operationQuery(input, [], ['expenseType']); const locationId = resolveLocationScope(user, q.requestedLocation);
    const where: Prisma.ExpenseWhereInput = { ...(locationId ? { locationId } : {}),
      ...(q.query.expenseType ? { expenseType: choiceValue(q.query.expenseType, expenseTypes, 'Expense type') } : {}),
      expenseDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) },
      ...(q.search ? { OR: [{ description: { contains: q.search, mode: 'insensitive' } }, { expenseType: { contains: q.search, mode: 'insensitive' } }] } : {}) };
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.expense.findMany({ where, select, orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize });
      const total = await tx.expense.count({ where }); return { items, total, page: q.page, pageSize: q.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async detail(rawId: string, user: AuthenticatedUser) {
    const locationId = resolveLocationScope(user);
    const row = await this.prisma.expense.findFirst({ where: { id: uuidValue(rawId), ...(locationId ? { locationId } : {}) }, select });
    if (!row) throw new NotFoundException('Expense not found.'); return row;
  }
  private async location(tx: Prisma.TransactionClient, actor: Pick<AuthenticatedUser, 'role' | 'locationId'>, requested: string | null | undefined) {
    if (requested === null || (requested === undefined && actor.role === 'ADMIN')) {
      if (actor.role !== 'ADMIN') throw new ForbiddenException('Only administrators may record company-wide expenses.');
      return null;
    }
    return activeLocation(tx, actor, requested);
  }
  async create(input: unknown, user: AuthenticatedUser) {
    const data = parse(input, false);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = await writeActor(tx, user); const locationId = await this.location(tx, actor, data.locationId);
        return tx.expense.create({ data: { ...data, locationId, expenseType: data.expenseType!, amount: data.amount!, expenseDate: data.expenseDate!, createdBy: user.id, createdAt: new Date() }, select });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error); }
  }
  async update(rawId: string, input: unknown, user: AuthenticatedUser) {
    const id = uuidValue(rawId); const data = parse(input, true);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = await writeActor(tx, user); const scope = resolveLocationScope(actor);
        const current = await tx.expense.findFirst({ where: { id, ...(scope ? { locationId: scope } : {}) } });
        if (!current) throw new NotFoundException('Expense not found.');
        const locationId = await this.location(tx, actor, data.locationId === undefined ? current.locationId : data.locationId);
        return tx.expense.update({ where: { id }, data: { ...data, locationId }, select });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error); }
  }
}
