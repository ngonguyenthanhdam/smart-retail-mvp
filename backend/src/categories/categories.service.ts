import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { databaseError } from '../common/database-errors';
import { bodyObject, booleanValue, listQuery, requiredText, uuidValue } from '../common/validation';

const select = { id: true, code: true, name: true, parentId: true, isActive: true, createdAt: true,
  parent: { select: { id: true, code: true, name: true } } } as const;

function parse(input: unknown, partial: boolean) {
  const body = bodyObject(input, ['code', 'name', 'parentId', 'isActive']);
  if (partial && !Object.keys(body).length) throw new BadRequestException('Provide at least one field.');
  return {
    ...(!partial || body.code !== undefined ? { code: requiredText(body.code, 'Code', 50) } : {}),
    ...(!partial || body.name !== undefined ? { name: requiredText(body.name, 'Name', 150) } : {}),
    ...(body.parentId !== undefined ? { parentId: body.parentId === null ? null : uuidValue(body.parentId) } : {}),
    ...(body.isActive !== undefined ? { isActive: booleanValue(body.isActive) } : {}),
  };
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: unknown) {
    const { search, status, page, pageSize } = listQuery(input);
    const where: Prisma.CategoryWhereInput = {
      ...(status === 'active' ? { isActive: true } : status === 'inactive' ? { OR: [{ isActive: false }, { isActive: null }] } : {}),
      ...(search ? { AND: [{ OR: ['code', 'name'].map((key) => ({ [key]: { contains: search, mode: 'insensitive' } })) }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({ where, select, orderBy: [{ code: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.category.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items, total, page, pageSize };
  }

  private async validateParent(tx: Prisma.TransactionClient, parentId: string | null, active: boolean, id?: string) {
    const visited = new Set(id ? [id] : []);
    let cursor = parentId;
    while (cursor) {
      if (visited.has(cursor)) throw new ConflictException('A category cannot be its own ancestor.');
      visited.add(cursor);
      const parent = await tx.category.findUnique({ where: { id: cursor }, select: { parentId: true, isActive: true } });
      if (!parent) throw new BadRequestException('Parent category not found.');
      if (active && !parent.isActive) throw new ConflictException('An active category requires an active parent.');
      cursor = parent.parentId;
    }
  }

  async create(input: unknown) {
    const data = parse(input, false);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.validateParent(tx, data.parentId ?? null, data.isActive ?? true);
        return tx.category.create({ data: { ...data, code: data.code!, name: data.name!, createdAt: new Date() }, select });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error); }
  }

  async update(rawId: string, input: unknown) {
    const id = uuidValue(rawId);
    const data = parse(input, true);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.category.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Category not found.');
        const active = data.isActive ?? current.isActive === true;
        if (!active && await tx.product.count({ where: { categoryId: id, isActive: true, deletedAt: null } })) {
          throw new ConflictException('Move or deactivate active products first.');
        }
        if (!active && await tx.category.count({ where: { parentId: id, isActive: true } })) {
          throw new ConflictException('Move or deactivate active child categories first.');
        }
        await this.validateParent(tx, data.parentId === undefined ? current.parentId : data.parentId, active, id);
        return tx.category.update({ where: { id }, data, select });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error); }
  }
}
