import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ALERT_ESCALATION_QUEUE } from '../../core/events';
import { FhirModule } from '../../core/fhir';
import { NotificationsModule } from '../../core/notifications';
import { M2TriageController } from './m2-triage.controller';
import { M2TriageService } from './m2-triage.service';

/** M2 — Triage (Encounter + Task) with P1 auto-alert (ARCH.md §2). */
@Module({
  imports: [
    FhirModule,
    NotificationsModule,
    BullModule.registerQueue({ name: ALERT_ESCALATION_QUEUE }),
  ],
  controllers: [M2TriageController],
  providers: [M2TriageService],
})
export class M2TriageModule {}
