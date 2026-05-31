import { Controller, type MessageEvent, Query, Sse, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { map, type Observable } from 'rxjs';

import { Public } from '../../core/auth/decorators/public.decorator';
import { DomainEventBus, type DomainEvent } from '../../core/events';

/**
 * Server-Sent Events stream of in-app notifications (one of M4's multi-channel
 * notification transports). EventSource cannot send an Authorization header, so
 * the access token arrives as a `?token=` query param and is verified here with
 * the same RS256 keys + issuer as the bearer guard. Marked @Public so the global
 * JwtAuthGuard does not reject the header-less request before we can validate it.
 */
@Controller('alerts')
export class AlertsStreamController {
  constructor(
    private readonly bus: DomainEventBus,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Sse('stream')
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    if (!token) throw new UnauthorizedException('Missing token');

    let payload: { purpose?: string };
    try {
      payload = this.jwt.verify<{ purpose?: string }>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    // Reject the short-lived MFA-challenge token; only an access token may stream.
    if (payload.purpose && payload.purpose !== 'access') {
      throw new UnauthorizedException('Invalid token');
    }

    return this.bus
      .stream()
      .pipe(map((event: DomainEvent): MessageEvent => ({ data: JSON.stringify(event), type: event.kind })));
  }
}
