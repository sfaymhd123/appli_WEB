import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import type { DomainEvent } from './events.constants';

/**
 * In-process pub/sub for domain events (the "in-app" notification channel).
 * A hot {@link Subject} feeds live subscribers (SSE), and a small ring buffer
 * lets late joiners / pollers read the most recent events.
 *
 * PHI safety: callers must only emit PHI-safe {@link DomainEvent}s — this bus
 * logs event *kinds* and counts, never the payload (ARCH.md §9).
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);
  private readonly subject = new Subject<DomainEvent>();
  private readonly recent: DomainEvent[] = [];
  private static readonly MAX_RECENT = 50;

  /** Publish an event to live subscribers and append it to the ring buffer. */
  emit(event: DomainEvent): void {
    this.recent.push(event);
    if (this.recent.length > DomainEventBus.MAX_RECENT) this.recent.shift();
    this.logger.log(`event ${event.kind}${event.urgent ? ' (urgent)' : ''}`);
    this.subject.next(event);
  }

  /** Hot stream of events for SSE subscribers. */
  stream(): Observable<DomainEvent> {
    return this.subject.asObservable();
  }

  /** Most-recent events first — a polling fallback for the in-app channel. */
  recentEvents(): DomainEvent[] {
    return [...this.recent].reverse();
  }
}
