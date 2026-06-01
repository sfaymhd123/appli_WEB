import { Module } from '@nestjs/common';

import { EventsModule } from '../../core/events';
import { FhirModule } from '../../core/fhir';
import { NotificationsModule } from '../../core/notifications';
import { M5ServicesController } from './m5-services.controller';
import { M5ServicesService } from './m5-services.service';

/**
 * M5 — Services médico-techniques: pharmacy, laboratory, imaging (ARCH.md §2).
 *
 * - FhirModule provides the FhirService (all HAPI access).
 * - NotificationsModule fans abnormal-result alerts to SMS + in-app channels.
 * - EventsModule exposes the DomainEventBus (in-app events + polling fallback).
 */
@Module({
  imports: [FhirModule, NotificationsModule, EventsModule],
  controllers: [M5ServicesController],
  providers: [M5ServicesService],
})
export class M5ServicesModule {}
