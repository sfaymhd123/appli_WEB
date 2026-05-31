import type { ChannelResult, ClinicalNotification } from './notification.types';

/**
 * A single delivery transport. New channels (push, websocket, e-mail) implement
 * this and get added to {@link NotificationService} without touching callers
 * — mirrors the pluggable SmsProvider design (CLAUDE.md §3).
 */
export interface NotificationChannel {
  readonly name: string;
  notify(notification: ClinicalNotification): Promise<ChannelResult>;
}
