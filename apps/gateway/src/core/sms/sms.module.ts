import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleSmsProvider } from './console-sms.provider';
import { SMS_PROVIDER } from './sms.constants';
import { SmsService } from './sms.service';
import type { SmsProvider } from './sms-provider.interface';

/**
 * Pluggable SMS core (CLAUDE.md §3). The provider is selected at runtime from
 * config (SMS_PROVIDER env): "console" (default, logs) today; a Twilio adapter
 * can be registered here later without changing any caller.
 */
@Module({
  providers: [
    ConsoleSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, ConsoleSmsProvider],
      useFactory: (config: ConfigService, consoleProvider: ConsoleSmsProvider): SmsProvider => {
        const kind = config.get<string>('smsProvider') ?? 'console';
        switch (kind) {
          // case 'twilio': return new TwilioSmsProvider(config); // optional adapter (P8+)
          case 'console':
          default:
            return consoleProvider;
        }
      },
    },
    SmsService,
  ],
  exports: [SmsService],
})
export class SmsModule {}
