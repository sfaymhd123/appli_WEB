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

  it('fires exactly once and anchors a create to the request body patientId', async () => {
    const { service, create, mirrorCreate } = makeAudit();
    const reflector = { getAllAndOverride: () => 'C' } as unknown as Reflector;
    const interceptor = new AuditInterceptor(reflector, service);

    // POST /triage style: no route param, patientId is in the body.
    const req = {
      user: { sub: 'nurse-1', role: 'Nurse', email: 'inf@hphii.ma' },
      body: { patientId: 'pat-7', systolicBp: 150 },
    };
    const next: CallHandler = {
      handle: () => of({ priority: 'P2', encounter: { resourceType: 'Encounter', id: 'enc-1' } }),
    };

    await lastValueFrom(interceptor.intercept(makeContext(req), next));
    await drainMicrotasks();

    expect(create).toHaveBeenCalledTimes(1);
    const event = create.mock.calls[0][0] as AuditEvent;
    expect(event.action).toBe('C');
    expect(event.entity?.[0]?.what?.reference).toBe('Patient/pat-7');
    expect(event.agent?.[0]?.type?.coding?.[0]?.code).toBe('Nurse');
    expect(mirrorCreate).toHaveBeenCalledTimes(1);
  });

  it('anchors to a response subject reference when no param/body id exists', async () => {
    const { service, create } = makeAudit();
    const reflector = { getAllAndOverride: () => 'U' } as unknown as Reflector;
    const interceptor = new AuditInterceptor(reflector, service);

    // PUT /triage/:id returns an Encounter carrying the patient under subject.
    const req = { user: { sub: 'doc-1', role: 'Physician', email: 'doc@hphii.ma' }, params: {} };
    const next: CallHandler = {
      handle: () =>
        of({ resourceType: 'Encounter', id: 'enc-9', subject: { reference: 'Patient/pat-42' } }),
    };

    await lastValueFrom(interceptor.intercept(makeContext(req), next));
    await drainMicrotasks();

    expect(create).toHaveBeenCalledTimes(1);
    const event = create.mock.calls[0][0] as AuditEvent;
    expect(event.entity?.[0]?.what?.reference).toBe('Patient/pat-42');
  });

  it('records nothing when no audit entity can be resolved', async () => {
    const { service, create } = makeAudit();
    const reflector = { getAllAndOverride: () => 'R' } as unknown as Reflector;
    const interceptor = new AuditInterceptor(reflector, service);

    // Authenticated + @Audit, but neither params, body, nor response carry a subject.
    const req = { user: { sub: 'u9', role: 'Admin', email: 'admin@hphii.ma' }, params: {} };
    const next: CallHandler = { handle: () => of({ total: 0, items: [] }) };

    await lastValueFrom(interceptor.intercept(makeContext(req), next));
    await drainMicrotasks();

    expect(create).not.toHaveBeenCalled();
  });
});
