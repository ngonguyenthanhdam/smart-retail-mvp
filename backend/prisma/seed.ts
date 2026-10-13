import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';

export interface InitialAdmin {
  username: string;
  email: string;
  password: string;
  fullName: string;
}

const initialRoles = [
  { code: 'ADMIN', name: 'Administrator' },
  { code: 'STORE_MANAGER', name: 'Store Manager' },
  { code: 'STAFF', name: 'Staff' },
] as const;

export function loadInitialAdmin(environment: NodeJS.ProcessEnv): InitialAdmin {
  const username = environment.INITIAL_ADMIN_USERNAME?.trim();
  const email = environment.INITIAL_ADMIN_EMAIL?.trim();
  const password = environment.INITIAL_ADMIN_PASSWORD;
  const fullName = environment.INITIAL_ADMIN_FULL_NAME?.trim();

  if (!username || username.length > 100) {
    throw new Error('INITIAL_ADMIN_USERNAME must contain between 1 and 100 characters.');
  }
  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('INITIAL_ADMIN_EMAIL must contain a valid email address of at most 255 characters.');
  }
  if (!fullName || fullName.length > 150) {
    throw new Error('INITIAL_ADMIN_FULL_NAME must contain between 1 and 150 characters.');
  }
  const passwordBytes = password ? Buffer.byteLength(password, 'utf8') : 0;
  if (!password || passwordBytes < 12 || passwordBytes > 72) {
    throw new Error('INITIAL_ADMIN_PASSWORD must contain between 12 and 72 UTF-8 bytes.');
  }

  return { username, email, password, fullName };
}

export async function seedAuthentication(
  prisma: PrismaClient,
  initialAdmin: InitialAdmin,
): Promise<'created' | 'unchanged'> {
  const admin = loadInitialAdmin({
    INITIAL_ADMIN_USERNAME: initialAdmin.username,
    INITIAL_ADMIN_EMAIL: initialAdmin.email,
    INITIAL_ADMIN_PASSWORD: initialAdmin.password,
    INITIAL_ADMIN_FULL_NAME: initialAdmin.fullName,
  });
  const passwordHash = await hash(admin.password, 12);

  return prisma.$transaction(async (transaction) => {
    for (const role of initialRoles) {
      await transaction.role.upsert({
        where: { code: role.code },
        create: role,
        update: {},
      });
    }

    const adminRole = await transaction.role.findUniqueOrThrow({
      where: { code: 'ADMIN' },
    });
    const identifiers = [admin.username, admin.email];
    const matches = await transaction.user.findMany({
      where: {
        OR: [{ username: { in: identifiers } }, { email: { in: identifiers } }],
      },
    });

    if (matches.length > 0) {
      const existing = matches[0];
      if (
        matches.length !== 1 ||
        !existing ||
        existing.username !== admin.username ||
        existing.email !== admin.email ||
        existing.roleId !== adminRole.id ||
        existing.isActive !== true ||
        existing.deletedAt !== null
      ) {
        throw new Error('Initial administrator identifiers conflict with an existing account. No account was changed.');
      }

      return 'unchanged';
    }

    const administratorExists = await transaction.user.findFirst({
      where: { roleId: adminRole.id },
      select: { id: true },
    });
    if (administratorExists) {
      throw new Error('An administrator already exists. A second initial administrator was not created.');
    }

    const now = new Date();
    await transaction.user.create({
      data: {
        username: admin.username,
        email: admin.email,
        passwordHash,
        fullName: admin.fullName,
        roleId: adminRole.id,
        locationId: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    });

    return 'created';
  }, { isolationLevel: 'Serializable' });
}

async function main(): Promise<void> {
  const initialAdmin = loadInitialAdmin(process.env);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed authentication.');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, options: '-c timezone=UTC' }) });

  try {
    const result = await seedAuthentication(prisma, initialAdmin);
    console.log(`Authentication seed complete; initial administrator ${result}.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch(() => {
    console.error('Authentication seed failed. Check the database, INITIAL_ADMIN_* configuration, and existing account identities.');
    process.exitCode = 1;
  });
}
