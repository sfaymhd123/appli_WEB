import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ConsoleSmsProvider } from './console-sms.provider';
import { MemorySmsProvider } from './memory-sms.provider';
import { SmsLogsController } from './sms-logs.controller';
import { SMS_PROVIDER } from './sms.constants';
import { SmsService } from './sms.service';
import type { SmsProvider } from './sms-provider.interface';

/**
 * Pluggable SMS core (ARCH.md §3). The provider is selected at runtime from
 * config (SMS_PROVIDER env): "memory" (default, in-memory logs) today; a
 * Twilio adapter can be registered here later without changing any caller.
 */
@Module({
  imports: [AuthModule, RbacModule],
  controllers: [SmsLogsController],
  providers: [
    ConsoleSmsProvider,
    MemorySmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, ConsoleSmsProvider, MemorySmsProvider],
      useFactory: (
        config: ConfigService,
        consoleProvider: ConsoleSmsProvider,
        memoryProvider: MemorySmsProvider,
      ): SmsProvider => {
        const kind = config.get<string>('smsProvider') ?? 'memory';
        switch (kind) {
          case 'console':
            return consoleProvider;
          case 'memory':
          default:
            return memoryProvider;
        }
      },
    },
    SmsService,
  ],
  exports: [SmsService],
})
export class SmsModule {}
