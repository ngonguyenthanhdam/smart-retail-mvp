import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { databaseError } from '../common/database-errors';
import { uuidValue } from '../common/validation';
import { locationQuery, parseLocation } from './location.dto';

const locationSelect = {
  id: true, code: true, name: true, locationType: true, address: true,
  district: true, city: true, isActive: true, createdAt: true, updatedAt: true,
} as const;

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: unknown) {
    const { search, status, type, page, pageSize } = locationQuery(input);
    const where: Prisma.LocationWhereInput = {
      deletedAt: null,
      ...(type ? { locationType: type } : {}),
      ...(status === 'active' ? { isActive: true } : status === 'inactive' ? { OR: [{ isActive: false }, { isActive: null }] } : {}),
      ...(search ? { AND: [{ OR: ['code', 'name', 'city'].map((key) => ({ [key]: { contains: search, mode: 'insensitive' } })) }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.location.findMany({ where, select: locationSelect, orderBy: [{ code: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.location.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items, total, page, pageSize };
  }

  async detail(rawId: string) {
    const location = await this.prisma.location.findFirst({ where: { id: uuidValue(rawId), deletedAt: null }, select: locationSelect });
    if (!location) throw new NotFoundException('Location not found.');
    return location;
  }

  private async requireSingleWarehouse(tx: Prisma.TransactionClient, locationType: string, active: boolean, exceptId?: string) {
    if (locationType === 'CENTRAL_WAREHOUSE' && active && await tx.location.count({
      where: { locationType: 'CENTRAL_WAREHOUSE', isActive: true, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    })) throw new ConflictException('An active central warehouse already exists. Deactivate it before activating another.');
  }

  async create(input: unknown) {
    const data = parseLocation(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireSingleWarehouse(tx, data.locationType, data.isActive);
        return tx.location.create({ data: { ...data, createdAt: new Date() }, select: locationSelect });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error); }
  }

  async update(rawId: string, input: unknown) {
    const id = uuidValue(rawId);
    const data = parseLocation(input, true);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.location.findFirst({ where: { id, deletedAt: null } });
        if (!current) throw new NotFoundException('Location not found.');
        const active = data.isActive ?? current.isActive === true;
        const type = data.locationType ?? current.locationType;
        if (type !== 'STORE' && await tx.storeProduct.count({ where: { locationId: id } })) {
          throw new ConflictException('A location with store product configurations must remain a store.');
        }
        if (!active && await tx.user.count({ where: { locationId: id, isActive: true, deletedAt: null } })) {
          throw new ConflictException('Transfer or deactivate the active accounts assigned to this location first.');
        }
        if (type !== 'STORE' && await tx.user.count({
          where: { locationId: id, deletedAt: null, role: { code: { in: ['STORE_MANAGER', 'STAFF'] } } },
        })) throw new ConflictException('Transfer the manager and staff accounts before changing this location to a warehouse.');
        await this.requireSingleWarehouse(tx, type, active, id);
        return tx.location.update({ where: { id }, data, select: locationSelect });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error); }
  }
}
