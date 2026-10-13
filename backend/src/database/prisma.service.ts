import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
        // The adapter serializes UTC date components without an offset.
        options: '-c timezone=UTC',
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
    } catch {
      await this.$disconnect();
      throw new Error('Database connection failed');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
