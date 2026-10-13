import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { databaseError } from '../common/database-errors';
import { bodyObject, booleanValue, listQuery, optionalText, requiredText, uuidValue } from '../common/validation';

function parse(input: unknown, partial: boolean) {
  const body = bodyObject(input, ['code', 'name', 'symbol', 'allowFraction']);
  if (partial && !Object.keys(body).length) throw new BadRequestException('Provide at least one field.');
  return {
    ...(!partial || body.code !== undefined ? { code: requiredText(body.code, 'Code', 30) } : {}),
    ...(!partial || body.name !== undefined ? { name: requiredText(body.name, 'Name', 100) } : {}),
    ...(body.symbol !== undefined ? { symbol: optionalText(body.symbol, 'Symbol', 20) } : {}),
    ...(body.allowFraction !== undefined ? { allowFraction: booleanValue(body.allowFraction) } : {}),
  };
}
@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(input: unknown) {
    const { search, page, pageSize } = listQuery(input);
    const where: Prisma.UnitWhereInput = search ? { OR: ['code', 'name', 'symbol'].map((key) => ({ [key]: { contains: search, mode: 'insensitive' } })) } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.unit.findMany({ where, orderBy: [{ code: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.unit.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items, total, page, pageSize };
  }
  async create(input: unknown) {
    const data = parse(input, false);
    try { return await this.prisma.unit.create({ data: { ...data, code: data.code!, name: data.name! } }); }
    catch (error) { databaseError(error); }
  }
  async update(rawId: string, input: unknown) {
    const id = uuidValue(rawId);
    const data = parse(input, true);
    if (!await this.prisma.unit.findUnique({ where: { id } })) throw new NotFoundException('Unit not found.');
    try { return await this.prisma.unit.update({ where: { id }, data }); }
    catch (error) { databaseError(error); }
  }
}
