import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../../core/auth/auth.module';
import { ALERT_ESCALATION_QUEUE, EventsModule } from '../../core/events';
import { FhirModule } from '../../core/fhir';
import { NotificationsModule } from '../../core/notifications';
import { AlertsStreamController } from './alerts-stream.controller';
import { EscalationProcessor } from './escalation.processor';
import {
  M4AlertsController,
  M4ObservationsController,
  M4VitalsController,
} from './m4-monitoring.controller';
import { M4MonitoringService } from './m4-monitoring.service';

/**
 * M4 — Monitoring & Alertes (ARCH.md §2/§7/§8). Wires the threshold engine,
 * the DetectedIssue lifecycle, the multi-channel NotificationService, and the
 * BullMQ-backed 15-min escalation worker.
 *
 * - EventsModule provides the shared BullMQ root connection + DomainEventBus.
 * - registerQueue declares the escalation queue (consumed by EscalationProcessor).
 * - AuthModule re-exports JwtModule so the SSE stream can verify ?token= access tokens.
 */
@Module({
  imports: [
    FhirModule,
    NotificationsModule,
    AuthModule,
    EventsModule,
    BullModule.registerQueue({ name: ALERT_ESCALATION_QUEUE }),
  ],
  controllers: [
    M4ObservationsController,
    M4AlertsController,
    M4VitalsController,
    AlertsStreamController,
  ],
  providers: [M4MonitoringService, EscalationProcessor],
})
export class M4MonitoringModule {}
