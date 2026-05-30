import { Injectable, Logger } from '@nestjs/common';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms-provider.interface';

/**
 * Default SMS provider: writes the message to the application log instead of
 * sending it (CLAUDE.md §3 — pluggable, default logs to console).
 *
 * PHI safety (CLAUDE.md §9): the destination is masked in logs, and callers
 * must keep message bodies free of patient identifiers/vitals — reference
 * resource ids only.
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = new Logger('SMS');

  send(message: SmsMessage): Promise<SmsSendResult> {
    this.logger.log(`SMS → ${maskDestination(message.to)}: ${message.body}`);
    return Promise.resolve({ provider: this.name, to: message.to, accepted: true });
  }
}

/** Show only the last 4 characters of a destination in logs. */
function maskDestination(to: string): string {
  if (to.length <= 4) return '***';
  return `***${to.slice(-4)}`;
}
