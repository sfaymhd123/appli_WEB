import { getQueueToken } from '@nestjs/bullmq';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { DetectedIssue } from 'fhir/r4';
import {
  AcknowledgementStatus,
  HphiiUrls,
  RiskGroup,
  Role,
  ZoneType,
} from '@hphii/fhir-domain';
import request from 'supertest';

import { AuditInterceptor } from '../src/core/audit/audit.interceptor';
import { AuditService } from '../src/core/audit/audit.service';
import { ALERT_ESCALATION_QUEUE, DomainEventBus, ESCALATION_JOB } from '../src/core/events';
import { FhirService } from '../src/core/fhir';
import { NotificationService } from '../src/core/notifications';
import { PolicyService } from '../src/core/rbac/policy.service';
import { RolesGuard } from '../src/core/rbac/guards/roles.guard';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { SmsService } from '../src/core/sms';
import { M1AccueilController } from '../src/modules/m1-accueil/m1-accueil.controller';
import { M1AccueilService } from '../src/modules/m1-accueil/m1-accueil.service';
import { M2TriageController } from '../src/modules/m2-triage/m2-triage.controller';
import { M2TriageService } from '../src/modules/m2-triage/m2-triage.service';
import {
  M4AlertsController,
  M4ObservationsController,
} from '../src/modules/m4-monitoring/m4-monitoring.controller';
import { M4MonitoringService } from '../src/modules/m4-monitoring/m4-monitoring.service';
import { M6DspController } from '../src/modules/m6-dsp/m6-dsp.controller';
import { M6DspService } from '../src/modules/m6-dsp/m6-dsp.service';
import { FakeAuthGuard } from './fake-auth.guard';
import { InMemoryFhir } from './in-memory-fhir';

/**
 * End-to-end flows over the real guard → audit pipeline (ARCH.md §6/§8).
 *
 * The HTTP stack is genuine — global ValidationPipe, the real RolesGuard +
 * PolicyService (RBAC) and the real AuditInterceptor + AuditService run on every
 * request, exactly as in production. Only the leaf I/O is faked: HAPI (an
 * in-memory FhirService), the gateway DB (a Prisma audit-mirror double), the SMS
 * / in-app notification fan-out, the BullMQ queue, and JWT auth (a header-driven
 * FakeAuthGuard that just attaches the principal so RolesGuard can decide).
 *
 * This keeps the suite deterministic and laptop-runnable (§1/§11) while proving
 * the two headline journeys plus the cross-cutting safety rules end-to-end:
 *   1. register → P1 triage → role-filtered DSP read
 *   2. breaching observation → Pending alert → 15-min timer escalation
 * and, alongside them, offline-replay idempotency, the audit guarantee, and RBAC.
 */
describe('Gateway e2e — clinical flows over the RBAC + audit pipeline', () => {
  let app: INestApplication;
  let fake: InMemoryFhir;
  const queue = { add: jest.fn(), getJob: jest.fn() };
  const notify = jest.fn();
  const smsSend = jest.fn();
  const mirrorCreate = jest.fn();

  /** PoC config: short, env-free defaults (no secrets — ARCH.md §9/§11). */
  const config = {
    get: (key: string): unknown =>
      ({
        alertEscalationMinutes: 15,
        alertEscalationSeconds: 0,
        referringNursePhone: '+212600000000',
        seniorPhysicianPhone: '+212600000001',
      })[key],
  };

  const patientBody = {
    firstName: 'Test',
    lastName: 'Patient',
    gender: 'male' as const,
    birthYear: 1985,
    zoneType: ZoneType.RURAL,
    riskGroup: RiskGroup.CHRONIC_RISK,
  };

  /** Build the x-test-* headers the FakeAuthGuard turns into req.user. */
  const as = (role: Role, sub = 'test-user'): Record<string, string> => ({
    'x-test-role': role,
    'x-test-sub': sub,
  });

  /** Let fire-and-forget audit microtasks (fhir.create → prisma mirror) settle. */
  const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  beforeAll(async () => {
    fake = new InMemoryFhir();
    const moduleRef = await Test.createTestingModule({
      controllers: [
        M1AccueilController,
        M2TriageController,
        M4ObservationsController,
        M4AlertsController,
        M6DspController,
      ],
      providers: [
        M1AccueilService,
        M2TriageService,
        M4MonitoringService,
        M6DspService,
        // Real security + audit layer (the whole point of an e2e here).
        PolicyService,
        AuditService,
        // Faked leaf I/O — casts are justified: these are deliberate test doubles
        // standing in for HAPI / DB / transports, not the real classes.
        { provide: FhirService, useValue: fake as unknown as FhirService },
        {
          provide: PrismaService,
          useValue: { auditMirror: { create: mirrorCreate } } as unknown as PrismaService,
        },
        {
          provide: NotificationService,
          useValue: { notify } as unknown as NotificationService,
        },
        { provide: SmsService, useValue: { send: smsSend } as unknown as SmsService },
        {
          provide: DomainEventBus,
          useValue: { emit: jest.fn(), recentEvents: () => [] } as unknown as DomainEventBus,
        },
        { provide: ConfigService, useValue: config },
        { provide: getQueueToken(ALERT_ESCALATION_QUEUE), useValue: queue },
        // Global chain, FakeAuthGuard first so req.user is set before RolesGuard.
        { provide: APP_GUARD, useClass: FakeAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fake.reset();
    queue.add.mockReset().mockResolvedValue(undefined);
    queue.getJob.mockReset().mockResolvedValue(undefined);
    notify.mockReset().mockResolvedValue({ channels: ['in-app'], smsAccepted: true });
    smsSend.mockReset().mockResolvedValue({ provider: 'console', accepted: true });
    mirrorCreate.mockReset().mockResolvedValue({});
  });

  const server = (): ReturnType<INestApplication['getHttpServer']> => app.getHttpServer();

  /** Register a patient through M1 and return its logical id. */
  async function register(role: Role = Role.NURSE): Promise<string> {
    const res = await request(server()).post('/patients').set(as(role)).send(patientBody).expect(201);
    return res.body.id as string;
  }

  /** Distinct resource types in a Bundle response body, sorted. */
  function typesIn(bundle: { entry?: Array<{ resource?: { resourceType?: string } }> }): string[] {
    const set = new Set<string>();
    for (const entry of bundle.entry ?? []) {
      const type = entry.resource?.resourceType;
      if (type) set.add(type);
    }
    return [...set].sort();
  }

  function ackOf(issue: { extension?: Array<{ url: string; valueString?: string }> }): string | undefined {
    return issue.extension?.find((ext) => ext.url === HphiiUrls.ACKNOWLEDGEMENT_STATUS)?.valueString;
  }

  it('Flow 1 — register → P1 triage → role-filtered DSP read (Nurse)', async () => {
    const patientId = await register(Role.NURSE);

    // Triage with a critical symptom → P1, which auto-raises a high alert (§8).
    const triage = await request(server())
      .post('/triage')
      .set(as(Role.NURSE))
      .send({ patientId, symptomSeverity: 'critical', complaint: 'PoC critical case' })
      .expect(201);
    expect(triage.body.priority).toBe('P1');
    expect(triage.body.critical).toBe(true);
    expect(triage.body.alert?.detectedIssue?.resourceType).toBe('DetectedIssue');

    // DSP read as Nurse: §6 narrows $everything to Patient + Observation +
    // DetectedIssue — the Encounter and Task created by triage must NOT leak.
    const dsp = await request(server()).get(`/dsp/${patientId}`).set(as(Role.NURSE)).expect(200);
    expect(typesIn(dsp.body)).toEqual(['DetectedIssue', 'Patient']);
    expect(typesIn(dsp.body)).not.toContain('Encounter');
    expect(typesIn(dsp.body)).not.toContain('Task');
    expect(dsp.body.meta?.tag?.[0]?.system).toBe(HphiiUrls.RBAC_FILTER);
    expect(dsp.body.meta?.tag?.[0]?.code).toBe(Role.NURSE);
  });

  it('Flow 2 — breaching observation raises a Pending alert, then the 15-min timer escalates it', async () => {
    const patientId = await register(Role.NURSE);

    // Systolic BP 160 mmHg > 140 → §7 high alert.
    const obs = await request(server())
      .post('/observations')
      .set(as(Role.NURSE))
      .send({ patientId, metric: 'systolic-bp', value: 160, source: 'app' })
      .expect(201);
    expect(obs.body.breached).toBe(true);
    expect(obs.body.severity).toBe('high');
    const alertId = obs.body.alert?.id as string;
    expect(alertId).toBeTruthy();
    expect(obs.body.alert.acknowledgement).toBe(AcknowledgementStatus.PENDING);

    // The escalation timer was armed exactly once, keyed by the alert id.
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      ESCALATION_JOB,
      { detectedIssueId: alertId },
      expect.objectContaining({ jobId: alertId }),
    );

    // The alert shows up as active + Pending.
    const alerts = await request(server()).get('/alerts').set(as(Role.NURSE)).expect(200);
    const active = alerts.body.alerts.find((a: { id: string }) => a.id === alertId);
    expect(active?.acknowledgement).toBe(AcknowledgementStatus.PENDING);

    // Fire the timer (what the BullMQ worker would do at T+15min): not acked →
    // escalate via the extension (never a non-FHIR status, §8) + notify senior.
    await app.get(M4MonitoringService).runEscalation(alertId);
    const escalated = await fake.read<DetectedIssue>('DetectedIssue', alertId);
    expect(ackOf(escalated)).toBe(AcknowledgementStatus.ESCALATED);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'alert.escalated', detectedIssueId: alertId, urgent: true }),
    );
  });

  it('offline replay is idempotent — a duplicated triage & observation neither duplicate nor re-alert (§8)', async () => {
    const patientId = await register(Role.NURSE);

    // Same client-request-id twice (a write queued offline, then replayed).
    const triageBody = { patientId, systolicBp: 130, clientRequestId: 'replay-triage-1' };
    const first = await request(server()).post('/triage').set(as(Role.NURSE)).send(triageBody).expect(201);
    expect(first.body.deduplicated).toBeFalsy();
    const second = await request(server()).post('/triage').set(as(Role.NURSE)).send(triageBody).expect(201);
    expect(second.body.deduplicated).toBe(true);
    expect(second.body.encounter.id).toBe(first.body.encounter.id);

    // A breaching reading replayed: the alert fires once, the timer arms once.
    const obsBody = { patientId, metric: 'systolic-bp', value: 165, clientRequestId: 'replay-obs-1' };
    const o1 = await request(server()).post('/observations').set(as(Role.NURSE)).send(obsBody).expect(201);
    expect(o1.body.alert).toBeDefined();
    expect(queue.add).toHaveBeenCalledTimes(1);

    const o2 = await request(server()).post('/observations').set(as(Role.NURSE)).send(obsBody).expect(201);
    expect(o2.body.deduplicated).toBe(true);
    expect(o2.body.alert).toBeUndefined();
    expect(queue.add).toHaveBeenCalledTimes(1); // no second escalation armed
  });

  it('every DSP access writes an AuditEvent recoverable via the audit trail (§8)', async () => {
    const patientId = await register(Role.NURSE); // audited: action C
    await request(server()).get(`/dsp/${patientId}`).set(as(Role.NURSE)).expect(200); // R
    await request(server()).get(`/dsp/${patientId}`).set(as(Role.PHYSICIAN)).expect(200); // R

    // Audit is fire-and-forget; let the chains settle before reading the trail.
    await flush();
    await flush();

    const trail = await request(server()).get(`/dsp/${patientId}/audit`).set(as(Role.PHYSICIAN)).expect(200);
    expect(trail.body.total).toBeGreaterThanOrEqual(3);
    const actions = new Set<string>(trail.body.events.map((e: { action: string }) => e.action));
    expect(actions.has('C')).toBe(true);
    expect(actions.has('R')).toBe(true);
    for (const event of trail.body.events) {
      expect(event.entity).toBe(`Patient/${patientId}`);
    }
    // The mirror in the gateway DB was written for each access too.
    expect(mirrorCreate.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('RBAC is enforced end-to-end — forbidden role/action/principal are rejected (§6)', async () => {
    const patientId = await register(Role.NURSE);

    // Triage is Nurse/Physician only → Admin is forbidden by @Roles.
    await request(server())
      .post('/triage')
      .set(as(Role.ADMIN))
      .send({ patientId, symptomSeverity: 'moderate' })
      .expect(403);

    // Export is Physician/Admin only (@RequireAction EXPORT_RECORD) → Nurse denied.
    await request(server())
      .post(`/dsp/${patientId}/documents`)
      .set(as(Role.NURSE))
      .send({ title: 'Résumé' })
      .expect(403);

    // No principal at all on a gated route → deny by default.
    await request(server()).get(`/dsp/${patientId}`).expect(403);
  });

  it('Flow 3 — auto-assign Elderly risk group if age >= 65 during registration', async () => {
    const currentYear = new Date().getFullYear();
    const elderlyBody = {
      firstName: 'Elderly',
      lastName: 'Patient',
      gender: 'female' as const,
      birthYear: currentYear - 70, // 70 years old
      zoneType: ZoneType.URBAN,
      riskGroup: RiskGroup.STANDARD, // User picks Standard
    };

    const res = await request(server())
      .post('/patients')
      .set(as(Role.NURSE))
      .send(elderlyBody)
      .expect(201);

    // Should be Elderly, not Standard (§5 PoC rules).
    const risk = res.body.extension.find((ext: any) => ext.url === HphiiUrls.RISK_GROUP)?.valueString;
    expect(risk).toBe(RiskGroup.ELDERLY);
  });
});
