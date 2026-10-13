import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { databaseError } from '../common/database-errors';
import { uuidValue } from '../common/validation';
import { parseCreateUser, parseUserChanges, userQuery } from './user.dto';

const userSelect = {
  id: true, username: true, email: true, fullName: true, isActive: true,
  locationId: true, createdAt: true, updatedAt: true,
  role: { select: { code: true } },
  location: { select: { id: true, code: true, name: true, locationType: true, isActive: true } },
} as const;
type SafeUserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
const accountResponse = (user: SafeUserRow) => ({ ...user, role: user.role.code });

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: unknown) {
    const { search, status, role, page, pageSize } = userQuery(input);
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(role ? { role: { code: role } } : {}),
      ...(status === 'active' ? { isActive: true } : status === 'inactive' ? { OR: [{ isActive: false }, { isActive: null }] } : {}),
      ...(search ? { AND: [{ OR: ['username', 'email', 'fullName'].map((key) => ({ [key]: { contains: search, mode: 'insensitive' } })) }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: userSelect, orderBy: [{ username: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.user.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items: items.map(accountResponse), total, page, pageSize };
  }

  async detail(rawId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: uuidValue(rawId), deletedAt: null }, select: userSelect });
    if (!user) throw new NotFoundException('User not found.');
    return accountResponse(user);
  }

  private async requireAdmin(tx: Prisma.TransactionClient, actorId: string) {
    const actor = await tx.user.findFirst({ where: { id: actorId, isActive: true, deletedAt: null, role: { code: 'ADMIN' } }, select: { id: true } });
    if (!actor) throw new ForbiddenException('Your account can no longer manage users.');
  }

  private async requireIdentifiers(tx: Prisma.TransactionClient, username: string, email: string, exceptId?: string) {
    // Login accepts either identifier; cross-column collisions must also be excluded.
    if (await tx.user.count({ where: {
      ...(exceptId ? { id: { not: exceptId } } : {}),
      OR: [{ username: { in: [username, email] } }, { email: { in: [username, email] } }],
    } })) throw new ConflictException('This username or email is already in use.');
  }

  private async requireAssignment(tx: Prisma.TransactionClient, role: string, locationId: string | null, requireActive: boolean) {
    if (!locationId) {
      if (role !== 'ADMIN') throw new BadRequestException('Manager and staff accounts require one store.');
      return;
    }
    const location = await tx.location.findFirst({ where: { id: locationId, deletedAt: null } });
    if (!location || (role !== 'ADMIN' && location.locationType !== 'STORE')) {
      throw new BadRequestException('Select a valid store for this account.');
    }
    if (requireActive && location.isActive !== true) throw new BadRequestException('Select an active store for this assignment.');
  }

  async create(input: unknown, actorId: string) {
    const { password, role, ...data } = parseCreateUser(input);
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireAdmin(tx, actorId);
        await this.requireIdentifiers(tx, data.username, data.email);
        await this.requireAssignment(tx, role, data.locationId, true);
        const assignedRole = await tx.role.findUnique({ where: { code: role } });
        if (!assignedRole) throw new BadRequestException('The selected role is unavailable.');
        const user = await tx.user.create({ data: { ...data, roleId: assignedRole.id, passwordHash, createdAt: new Date() }, select: userSelect });
        return accountResponse(user);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error); }
  }

  async update(rawId: string, input: unknown, actorId: string) {
    const id = uuidValue(rawId);
    const { role: requestedRole, ...changes } = parseUserChanges(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireAdmin(tx, actorId);
        const current = await tx.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
        if (!current) throw new NotFoundException('User not found.');
        const role = requestedRole ?? current.role.code;
        const active = changes.isActive ?? current.isActive === true;
        const locationId = changes.locationId !== undefined ? changes.locationId
          : requestedRole === 'ADMIN' && current.role.code !== 'ADMIN' ? null : current.locationId;
        if (id === actorId && (!active || role !== 'ADMIN')) {
          throw new ConflictException('You cannot deactivate or demote your own account.');
        }
        if (current.role.code === 'ADMIN' && current.isActive === true && (!active || role !== 'ADMIN')) {
          const admins = await tx.user.count({ where: { isActive: true, deletedAt: null, role: { code: 'ADMIN' } } });
          if (admins <= 1) throw new ConflictException('The last active administrator cannot be deactivated or demoted.');
        }
        await this.requireIdentifiers(tx, current.username, changes.email ?? current.email, id);
        await this.requireAssignment(tx, role, locationId,
          locationId !== current.locationId || role !== current.role.code || (active && current.isActive !== true));
        const assignedRole = await tx.role.findUnique({ where: { code: role } });
        if (!assignedRole) throw new BadRequestException('The selected role is unavailable.');
        const clearReset = !active || (changes.email !== undefined && changes.email !== current.email);
        const user = await tx.user.update({ where: { id }, data: {
          ...changes, locationId, roleId: assignedRole.id,
          ...(clearReset ? { passwordResetTokenHash: null, passwordResetExpiresAt: null } : {}),
        }, select: userSelect });
        return accountResponse(user);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { databaseError(error); }
  }
}
