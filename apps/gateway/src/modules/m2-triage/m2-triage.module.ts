import { Module } from '@nestjs/common';
import { FhirModule } from '../../core/fhir';
import { SmsModule } from '../../core/sms';
import { M2TriageController } from './m2-triage.controller';
import { M2TriageService } from './m2-triage.service';

/** M2 — Triage (Encounter + Task) with P1 auto-alert (CLAUDE.md §2). */
@Module({
  imports: [FhirModule, SmsModule],
  controllers: [M2TriageController],
  providers: [M2TriageService],
})
export class M2TriageModule {}
