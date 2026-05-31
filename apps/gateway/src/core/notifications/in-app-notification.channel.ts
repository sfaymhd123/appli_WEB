import { Injectable } from '@nestjs/common';

import { DomainEventBus } from '../events';
import type { NotificationChannel } from './notification-channel.interface';
import type { ChannelResult, ClinicalNotification } from './notification.types';

/**
 * Delivers a notification to in-app subscribers by emitting a domain event on
 * the {@link DomainEventBus} (streamed to clients over SSE).
 */
@Injectable()
export class InAppNotificationChannel implements NotificationChannel {
  readonly name = 'in-app';

  constructor(private readonly events: DomainEventBus) {}

  async notify(notification: ClinicalNotification): Promise<ChannelResult> {
    this.events.emit({
      kind: notification.kind,
      at: new Date().toISOString(),
      detectedIssueId: notification.detectedIssueId,
      patient: notification.patient,
      severity: notification.severity,
      urgent: notification.urgent,
      message: notification.body,
    });
    return { channel: this.name, ok: true };
  }
}
