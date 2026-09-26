import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { AppConfig } from './config.js';

/**
 * The one Prisma client. Prisma 7 talks to Postgres through the `pg` driver adapter.
 * It connects lazily on the first query, so building the app (for example to write the
 * OpenAPI document) needs no database.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** The client handed to callbacks of `prisma.$transaction(async (tx) => …)`. */
export type Tx = Prisma.TransactionClient;
