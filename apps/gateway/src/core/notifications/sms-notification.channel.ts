import { Injectable } from '@nestjs/common';

import { SmsService } from '../sms';
import type { NotificationChannel } from './notification-channel.interface';
import type { ChannelResult, ClinicalNotification } from './notification.types';

/** Delivers a notification over the configured SMS provider. */
@Injectable()
export class SmsNotificationChannel implements NotificationChannel {
  readonly name = 'sms';

  constructor(private readonly sms: SmsService) {}

  async notify(notification: ClinicalNotification): Promise<ChannelResult> {
    if (!notification.to) {
      return { channel: this.name, ok: false, provider: this.sms.providerName };
    }
    const result = await this.sms.send({ to: notification.to, body: notification.body });
    return { channel: this.name, ok: result.accepted, provider: result.provider };
  }
}
