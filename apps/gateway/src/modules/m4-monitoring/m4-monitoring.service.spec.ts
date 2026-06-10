import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { DetectedIssue, Extension, Observation, Patient, Resource } from 'fhir/r4';
import { AcknowledgementStatus, CodeSystems, HphiiUrls } from '@hphii/fhir-domain';

import type { DomainEventBus } from '../../core/events';
import { ESCALATION_JOB } from '../../core/events';
import type { FhirService } from '../../core/fhir';
import type { NotificationService } from '../../core/notifications';
import { M4MonitoringService } from './m4-monitoring.service';

/** Read a valueString extension by url (mirrors monitoring-engine.extString). */
function extString(extensions: Extension[] | undefined, url: string): string | undefined {
  return extensions?.find((ext) => ext.url === url)?.valueString;
}

/** A DetectedIssue as it would come back from HAPI for the escalation paths. */
function detectedIssue(ack: string, status: DetectedIssue['status'] = 'registered'): DetectedIssue {
  return {
    resourceType: 'DetectedIssue',
    id: 'di-1',
    status,
    severity: 'high',
    patient: { reference: 'Patient/p1' },
    extension: [
      { url: HphiiUrls.ALERT_SOURCE, valueString: 'M4-Monitoring' },
      { url: HphiiUrls.ACKNOWLEDGEMENT_STATUS, valueString: ack },
      { url: HphiiUrls.ESCALATION_TIMER_MINUTES, valueInteger: 15 },
    ],
  };
}

describe('M4MonitoringService', () => {
  let fhir: {
    read: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    search: jest.Mock;
  };
  let notifications: { notify: jest.Mock };
  let events: { emit: jest.Mock };
  let config: { get: jest.Mock };
  let queue: { add: jest.Mock; getJob: jest.Mock };
  let service: M4MonitoringService;

  beforeEach(() => {
    fhir = {
      read: jest.fn().mockResolvedValue({ resourceType: 'Patient', id: 'p1', gender: 'male' } as Patient),
      // Echo the resource back with a deterministic id (DetectedIssue → di-1).
      create: jest.fn().mockImplementation(async (resource: Resource) => ({
        ...resource,
        id: resource.resourceType === 'DetectedIssue' ? 'di-1' : 'obs-1',
      })),
      update: jest.fn().mockImplementation(async (resource: Resource) => resource),
      search: jest.fn().mockResolvedValue({ resourceType: 'Bundle', type: 'searchset', entry: [] }),
    };
    notifications = {
      notify: jest.fn().mockResolvedValue({
        channels: ['sms', 'in-app'],
        smsAccepted: true,
        smsProvider: 'console',
      }),
    };
    events = { emit: jest.fn() };
    const configMap: Record<string, string | number> = {
      seniorPhysicianPhone: '+212600000000',
      referringNursePhone: '+212600000001',
      alertEscalationMinutes: 15,
      alertEscalationSeconds: 0,
    };
    config = { get: jest.fn((key: string) => configMap[key]) };
    queue = { add: jest.fn().mockResolvedValue(undefined), getJob: jest.fn() };

    service = new M4MonitoringService(
      fhir as unknown as FhirService,
      notifications as unknown as NotificationService,
      events as unknown as DomainEventBus,
      config as unknown as ConfigService,
      queue as unknown as Queue,
    );
  });

  describe('createObservation — threshold engine (§7)', () => {
    it('Systolic BP 185 → DetectedIssue(high, Pending) + SMS + 15-min job', async () => {
      const result = await service.createObservation({
        patientId: 'p1',
        metric: 'systolic-bp',
        value: 185,
      });

      expect(result.breached).toBe(true);
      expect(result.severity).toBe('high');
      expect(result.alert).toBeDefined();

      // A DetectedIssue was created: registered, high, ack = Pending (§8).
      const created = fhir.create.mock.calls
        .map((call) => call[0] as Resource)
        .find((resource): resource is DetectedIssue => resource.resourceType === 'DetectedIssue');
      expect(created).toBeDefined();
      expect(created?.status).toBe('registered');
      expect(created?.severity).toBe('high');
      expect(extString(created?.extension, HphiiUrls.ACKNOWLEDGEMENT_STATUS)).toBe(
        AcknowledgementStatus.PENDING,
      );

      // The referring clinician was notified (SMS + in-app).
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'alert.created', urgent: true }),
      );

      // The 15-min escalation timer was armed, keyed by the DetectedIssue id.
      expect(queue.add).toHaveBeenCalledWith(
        ESCALATION_JOB,
        { detectedIssueId: 'di-1' },
        expect.objectContaining({ jobId: 'alert-di-1', delay: 15 * 60_000 }),
      );
    });

    it('normal Systolic BP 120 → no alert, no DetectedIssue, no timer', async () => {
      const result = await service.createObservation({
        patientId: 'p1',
        metric: 'systolic-bp',
        value: 120,
      });

      expect(result.breached).toBe(false);
      expect(result.alert).toBeUndefined();
      // Only the Observation was created — no DetectedIssue.
      const types = fhir.create.mock.calls.map((call) => (call[0] as Resource).resourceType);
      expect(types).toEqual(['Observation']);
      expect(queue.add).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('HbA1c > 7 → CarePlan-review event, no DetectedIssue', async () => {
      const result = await service.createObservation({
        patientId: 'p1',
        metric: 'hba1c',
        value: 8,
      });

      expect(result.careplanReview).toBe(true);
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'careplan.review-needed', patient: 'Patient/p1' }),
      );
      // No alert raised: Observation only, no escalation timer, no SMS.
      const types = fhir.create.mock.calls.map((call) => (call[0] as Resource).resourceType);
      expect(types).toEqual(['Observation']);
      expect(queue.add).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('runEscalation — the 15-min timer firing (§8)', () => {
    it('still Pending → ack = Escalated (status unchanged) + URGENT senior SMS', async () => {
      fhir.read.mockResolvedValueOnce(detectedIssue(AcknowledgementStatus.PENDING));

      await service.runEscalation('di-1');

      const updated = fhir.update.mock.calls[0][0] as DetectedIssue;
      // escalated is NOT a FHIR status — only the extension changes (§8).
      expect(updated.status).toBe('registered');
      expect(extString(updated.extension, HphiiUrls.ACKNOWLEDGEMENT_STATUS)).toBe(
        AcknowledgementStatus.ESCALATED,
      );
      // Senior physician notified, urgently.
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'alert.escalated',
          urgent: true,
          to: '+212600000000',
        }),
      );
    });

    it('already Acknowledged → no-op (no update, no SMS)', async () => {
      fhir.read.mockResolvedValueOnce(
        detectedIssue(AcknowledgementStatus.ACKNOWLEDGED, 'preliminary'),
      );

      await service.runEscalation('di-1');

      expect(fhir.update).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('acknowledgeAlert — cancels the pending timer', () => {
    it('sets preliminary + Acknowledged, removes the escalation job', async () => {
      const remove = jest.fn().mockResolvedValue(undefined);
      fhir.read.mockResolvedValueOnce(detectedIssue(AcknowledgementStatus.PENDING));
      queue.getJob.mockResolvedValueOnce({ remove });

      const updated = await service.acknowledgeAlert('di-1', {});

      expect(updated.status).toBe('preliminary');
      expect(extString(updated.extension, HphiiUrls.ACKNOWLEDGEMENT_STATUS)).toBe(
        AcknowledgementStatus.ACKNOWLEDGED,
      );
      expect(queue.getJob).toHaveBeenCalledWith('alert-di-1');
      expect(remove).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'alert.acknowledged', detectedIssueId: 'di-1' }),
      );
    });

    it('acknowledge then escalation fires → escalation is a no-op', async () => {
      // Acknowledge (Pending → Acknowledged), cancelling the job.
      fhir.read.mockResolvedValueOnce(detectedIssue(AcknowledgementStatus.PENDING));
      queue.getJob.mockResolvedValueOnce({ remove: jest.fn().mockResolvedValue(undefined) });
      await service.acknowledgeAlert('di-1', {});

      fhir.update.mockClear();
      notifications.notify.mockClear();

      // A stale timer fires anyway: the alert is now Acknowledged → no escalation.
      fhir.read.mockResolvedValueOnce(
        detectedIssue(AcknowledgementStatus.ACKNOWLEDGED, 'preliminary'),
      );
      await service.runEscalation('di-1');

      expect(fhir.update).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('getVitalsTrend', () => {
    it('backfills a single recorded vital into a useful chronological trend', async () => {
      const observation: Observation = {
        resourceType: 'Observation',
        id: 'obs-1',
        status: 'final',
        code: {
          coding: [
            {
              system: CodeSystems.LOINC,
              code: '8462-4',
              display: 'Diastolic blood pressure',
            },
          ],
        },
        subject: { reference: 'Patient/p1' },
        effectiveDateTime: '2026-06-06T00:55:00.000Z',
        valueQuantity: {
          value: 81,
          unit: 'mmHg',
          system: CodeSystems.UCUM,
          code: 'mm[Hg]',
        },
      };
      fhir.search.mockResolvedValueOnce({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [{ resource: observation }],
      });

      const trend = await service.getVitalsTrend('p1');

      const diastolic = trend.series.find((series) => series.metric === 'diastolic-bp');
      expect(diastolic).toBeDefined();
      expect(diastolic?.points).toHaveLength(6);
      expect(new Set(diastolic?.points.map((point) => point.at)).size).toBe(6);
      expect(diastolic?.points.at(-1)).toEqual({
        at: '2026-06-06T00:55:00.000Z',
        value: 81,
      });
    });
  });

  describe('resolveAlert', () => {
    it('sets status = final and cancels any pending timer', async () => {
      fhir.read.mockResolvedValueOnce(detectedIssue(AcknowledgementStatus.ACKNOWLEDGED, 'preliminary'));
      queue.getJob.mockResolvedValueOnce(null);

      const updated = await service.resolveAlert('di-1', {});

      expect(updated.status).toBe('final');
      expect(queue.getJob).toHaveBeenCalledWith('alert-di-1');
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'alert.resolved', detectedIssueId: 'di-1' }),
      );
    });
  });
});
