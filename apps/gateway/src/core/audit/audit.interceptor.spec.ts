import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AuditEvent } from 'fhir/r4';
import { lastValueFrom, of } from 'rxjs';

import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

// Minimal test doubles for FhirService + PrismaService (the Nest types are large).
function makeAudit() {
  const create = jest.fn().mockResolvedValue({ resourceType: 'AuditEvent', id: 'ae-1' });
  const mirrorCreate = jest.fn().mockResolvedValue({});
  const fhir = { create } as unknown as ConstructorParameters<typeof AuditService>[0];
  const prisma = {
    auditMirror: { create: mirrorCreate },
  } as unknown as ConstructorParameters<typeof AuditService>[1];
  return { service: new AuditService(fhir, prisma), create, mirrorCreate };
}

function makeContext(req: unknown): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

// record() is fire-and-forget; let its microtasks settle before asserting.
const drainMicrotasks = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('AuditInterceptor', () => {
  it('posts exactly one AuditEvent for a successful audited read', async () => {
    const { service, create, mirrorCreate } = makeAudit();
    const reflector = { getAllAndOverride: () => 'R' } as unknown as Reflector;
    const interceptor = new AuditInterceptor(reflector, service);

    const req = {
      user: { sub: 'u1', role: 'Physician', email: 'doc@hphii.ma' },
      params: { id: 'pat-123' },
    };
    const next: CallHandler = { handle: () => of({ resourceType: 'Patient', id: 'pat-123' }) };

    await lastValueFrom(interceptor.intercept(makeContext(req), next));
    await drainMicrotasks();

    expect(create).toHaveBeenCalledTimes(1);
    const event = create.mock.calls[0][0] as AuditEvent;
    expect(event.resourceType).toBe('AuditEvent');
    expect(event.action).toBe('R');
    expect(event.outcome).toBe('0');
    expect(event.entity?.[0]?.what?.reference).toBe('Patient/pat-123');
    expect(event.agent?.[0]?.type?.coding?.[0]?.code).toBe('Physician');
    expect(mirrorCreate).toHaveBeenCalledTimes(1);
  });

  it('does not audit a route without @Audit metadata', async () => {
    const { service, create } = makeAudit();
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const interceptor = new AuditInterceptor(reflector, service);

    const next: CallHandler = { handle: () => of('ok') };
    await lastValueFrom(interceptor.intercept(makeContext({}), next));
    await drainMicrotasks();

    expect(create).not.toHaveBeenCalled();
  });
});
