import { Injectable, Logger } from '@nestjs/common';

import { InAppNotificationChannel } from './in-app-notification.channel';
import type { NotificationChannel } from './notification-channel.interface';
import { SmsNotificationChannel } from './sms-notification.channel';
import type {
  ChannelResult,
  ClinicalNotification,
  NotificationDispatchResult,
} from './notification.types';

/**
 * Multi-channel notification fan-out (CLAUDE.md §8 — alerts notify the clinician
 * via SMS + in-app). Adding a channel = register it here; callers are untouched.
 * Channel failures are isolated so one transport never blocks the others.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly channels: NotificationChannel[];

  constructor(sms: SmsNotificationChannel, inApp: InAppNotificationChannel) {
    this.channels = [sms, inApp];
  }

  async notify(notification: ClinicalNotification): Promise<NotificationDispatchResult> {
    const results = await Promise.all(
      this.channels.map((channel) =>
        channel.notify(notification).catch((error: unknown): ChannelResult => {
          this.logger.warn(`channel ${channel.name} failed: ${describe(error)}`);
          return { channel: channel.name, ok: false };
        }),
      ),
    );

    const sms = results.find((result) => result.channel === 'sms');
    const delivered = results.filter((result) => result.ok).map((result) => result.channel);
    this.logger.log(`notify ${notification.kind} → [${delivered.join(', ') || 'none'}]`);

    return {
      channels: delivered,
      smsAccepted: sms?.ok ?? false,
      smsProvider: sms?.provider,
    };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
