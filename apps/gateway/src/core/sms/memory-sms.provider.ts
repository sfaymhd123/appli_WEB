import { Injectable, Logger } from '@nestjs/common';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms-provider.interface';

export interface SmsLogEntry extends SmsMessage {
  id: string;
  at: string;
  provider: string;
}

/**
 * PoC-friendly SMS provider: keeps the last 50 messages in memory so they can
 * be inspected via API, and also logs them to the console.
 */
@Injectable()
export class MemorySmsProvider implements SmsProvider {
  readonly name = 'memory';
  private readonly logger = new Logger('SMS');
  private logs: SmsLogEntry[] = [];

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const entry: SmsLogEntry = {
      id: Math.random().toString(36).slice(2, 9),
      at: new Date().toISOString(),
      provider: this.name,
      ...message,
    };

    this.logs.unshift(entry);
    if (this.logs.length > 50) this.logs.pop();

    this.logger.log(`[${this.name}] SMS → ${maskDestination(message.to)}: ${message.body}`);
    return { provider: this.name, to: message.to, accepted: true, reference: entry.id };
  }

  /** Retrieve all in-memory logs (most-recent first). */
  getLogs(): SmsLogEntry[] {
    return this.logs;
  }

  /** Clear all logs. */
  clear(): void {
    this.logs = [];
  }
}

function maskDestination(to: string): string {
  if (to.length <= 4) return '***';
  return `***${to.slice(-4)}`;
}
