import { Module } from '@nestjs/common';

import { EventsModule } from '../../core/events';
import { FhirModule } from '../../core/fhir';
import { CarePlanReviewListener } from './care-plan-review.listener';
import { M3ParcoursController } from './m3-parcours.controller';
import { M3ParcoursService } from './m3-parcours.service';

/**
 * M3 — Parcours chronique (CarePlan) & épisodique (Encounter), plus the
 * CarePlan-review listener bridging M4's HbA1c>7 event (CLAUDE.md §2/§8).
 */
@Module({
  imports: [FhirModule, EventsModule],
  controllers: [M3ParcoursController],
  providers: [M3ParcoursService, CarePlanReviewListener],
})
export class M3ParcoursModule {}
