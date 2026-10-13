import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { isRoleCode, type AuthenticatedUser } from './auth.types';

const accountSelect = {
  id: true, username: true, email: true, fullName: true, isActive: true, deletedAt: true,
  locationId: true, role: { select: { code: true } },
  location: { select: { id: true, code: true, name: true, locationType: true } },
} as const;

type Account = Awaited<ReturnType<AuthService['findAccount']>>;
const INVALID_LOGIN = 'Invalid username/email or password.';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';

  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  }

  findAccount(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: accountSelect });
  }

  private normalize(account: Account): AuthenticatedUser | null {
    if (!account || account.isActive !== true || account.deletedAt || !isRoleCode(account.role.code)) return null;
    if (account.role.code !== 'ADMIN' && (!account.locationId || account.location?.locationType !== 'STORE')) return null;
    return {
      id: account.id, username: account.username, email: account.email,
      fullName: account.fullName, role: account.role.code, locationId: account.locationId,
      location: account.location ? { id: account.location.id, code: account.location.code, name: account.location.name } : null,
    };
  }

  async currentUser(id: string): Promise<AuthenticatedUser> {
    const user = this.normalize(await this.findAccount(id));
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async login(input: unknown): Promise<{ user: AuthenticatedUser; token: string }> {
    if (!input || typeof input !== 'object') throw new UnauthorizedException(INVALID_LOGIN);
    const { identifier, password } = input as Record<string, unknown>;
    if (typeof identifier !== 'string' || typeof password !== 'string' ||
      !identifier.trim() || identifier.trim().length > 255 || !password || Buffer.byteLength(password) > 72) {
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    // Each identifier column is unique, but a username can equal another user's email.
    // Ambiguous credentials must never select an arbitrary account.
    const accounts = await this.prisma.user.findMany({
      where: { OR: [{ username: identifier.trim() }, { email: identifier.trim() }] },
      select: { ...accountSelect, passwordHash: true }, take: 2,
    });
    const account = accounts.length === 1 ? accounts[0] : null;
    const matches = await bcrypt.compare(password, account?.passwordHash ?? this.dummyHash);
    const user = this.normalize(account ?? null);
    if (!matches || !user) throw new UnauthorizedException(INVALID_LOGIN);
    return { user, token: await this.jwt.signAsync({ sub: user.id }) };
  }
}
