import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Subscription } from 'rxjs';

import { DomainEventBus } from '../../core/events';
import { M3ParcoursService } from './m3-parcours.service';

/**
 * Bridges M4 → M3: when the monitoring engine emits `careplan.review-needed`
 * (HbA1c > 7, ARCH.md §8), mark the patient's active CarePlan(s) for review.
 * Subscribes to the in-process DomainEventBus; PHI-safe (refs + counts only).
 */
@Injectable()
export class CarePlanReviewListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CarePlanReviewListener.name);
  private subscription?: Subscription;

  constructor(
    private readonly events: DomainEventBus,
    private readonly service: M3ParcoursService,
  ) {}

  onModuleInit(): void {
    this.subscription = this.events.stream().subscribe((event) => {
      if (event.kind === 'careplan.review-needed' && event.patient) {
        void this.service
          .handleReviewNeeded(event.patient, event.message)
          .catch((err) =>
            this.logger.error(`Failed to flag CarePlan review: ${String(err)}`),
          );
      }
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
