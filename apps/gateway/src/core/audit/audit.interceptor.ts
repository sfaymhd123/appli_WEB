import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, tap } from 'rxjs';

import type { AuthenticatedUser } from '../auth/auth.types';
import { AUDIT_KEY, type AuditAction } from './decorators/audit.decorator';
import { AuditService } from './audit.service';

interface AuditableRequest {
  user?: AuthenticatedUser;
  params?: Record<string, string>;
}

/**
 * Global interceptor: for every handler marked @Audit(...), post exactly one
 * AuditEvent on success (CLAUDE.md §8 — every DSP access is audited).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.getAllAndOverride<AuditAction | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<AuditableRequest>();
    const user = req.user;

    return next.handle().pipe(
      tap((body) => {
        const entity = resolveAuditEntity(req, body);
        if (user && entity) {
          // Fire-and-forget: AuditService.record never rejects (it logs + mirrors).
          void this.audit.record({
            action,
            entity,
            actorSub: user.sub,
            actorRole: user.role,
            outcome: '0',
          });
        }
      }),
    );
  }
}

/** Resolve the audited entity reference from the route params or the response. */
function resolveAuditEntity(req: AuditableRequest, body: unknown): string | undefined {
  const params = req.params ?? {};
  const id = params.patientId ?? params.id;
  if (typeof id === 'string' && id.length > 0) {
    return `Patient/${id}`;
  }
  if (body !== null && typeof body === 'object') {
    const resource = body as { resourceType?: string; id?: string };
    if (resource.resourceType === 'Patient' && typeof resource.id === 'string') {
      return `Patient/${resource.id}`;
    }
  }
  return undefined;
}
