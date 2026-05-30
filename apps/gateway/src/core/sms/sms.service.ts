import { Inject, Injectable } from '@nestjs/common';
import { SMS_PROVIDER } from './sms.constants';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms-provider.interface';

/** Thin facade over the configured SmsProvider — the only thing modules inject. */
@Injectable()
export class SmsService {
  constructor(@Inject(SMS_PROVIDER) private readonly provider: SmsProvider) {}

  /** The active provider's name (e.g. "console", "twilio"). */
  get providerName(): string {
    return this.provider.name;
  }

  send(message: SmsMessage): Promise<SmsSendResult> {
    return this.provider.send(message);
  }
}
