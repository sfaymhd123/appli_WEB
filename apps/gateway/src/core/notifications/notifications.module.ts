import { Module } from '@nestjs/common';

import { EventsModule } from '../events';
import { SmsModule } from '../sms';
import { InAppNotificationChannel } from './in-app-notification.channel';
import { NotificationService } from './notification.service';
import { SmsNotificationChannel } from './sms-notification.channel';

/** Multi-channel notifications (SMS + in-app). Exports {@link NotificationService}. */
@Module({
  imports: [SmsModule, EventsModule],
  providers: [SmsNotificationChannel, InAppNotificationChannel, NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
