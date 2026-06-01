import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import type { AppConfig } from '../config/configuration';

/**
 * Prisma client for the gateway database (users / sessions / MFA / audit
 * mirror). ARCH.md §3: NO clinical data here — that lives in HAPI.
 *
 * The datasource URL is passed explicitly from typed config so connection does
 * not depend on process.env timing.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<AppConfig, true>) {
    super({
      datasources: { db: { url: config.get('gatewayDatabaseUrl', { infer: true }) } },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to the gateway database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
