import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import { DomainEventBus } from './domain-event-bus';

/**
 * BullMQ + Redis (CLAUDE.md §3) plus the in-process {@link DomainEventBus}.
 *
 * `BullModule.forRootAsync` registers the shared Redis connection used by every
 * queue/worker in the app (the 15-min escalation timer lives in M4). Feature
 * modules attach their queues with `BullModule.registerQueue`.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        connection: redisConnection(config.get('redisUrl', { infer: true })),
      }),
    }),
  ],
  providers: [DomainEventBus],
  exports: [DomainEventBus, BullModule],
})
export class EventsModule {}

/** Parse a redis:// URL into ioredis connection options (PoC: host/port). */
function redisConnection(url: string): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  maxRetriesPerRequest: null;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    // Recommended by BullMQ for blocking worker commands.
    maxRetriesPerRequest: null,
  };
}
