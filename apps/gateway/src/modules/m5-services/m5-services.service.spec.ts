import type {
  Bundle,
  DiagnosticReport,
  FhirResource,
  MedicationRequest,
  Observation,
  Resource,
  ServiceRequest,
} from 'fhir/r4';
import { CodeSystems, HphiiUrls, ServiceCategory, ServiceCategorySnomed, StockStatus } from '@hphii/fhir-domain';

import type { DomainEventBus } from '../../core/events';
import type { FhirService } from '../../core/fhir';
import type { NotificationService } from '../../core/notifications';
import { M5ServicesService } from './m5-services.service';
import { simulateStock } from './services-engine';

/** Wrap resources in a FHIR searchset Bundle (the shape FhirService.search returns). */
function searchset(resources: FhirResource[]): Bundle {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: resources.map((resource) => ({ resource })),
  };
}

/** First created resource of a given type passed to fhir.create. */
function created<T extends Resource>(create: jest.Mock, resourceType: T['resourceType']): T | undefined {
  return create.mock.calls
    .map((call) => call[0] as Resource)
    .find((resource): resource is T => resource.resourceType === resourceType);
}

/** First updated resource of a given type passed to fhir.update. */
function updated<T extends Resource>(update: jest.Mock, resourceType: T['resourceType']): T | undefined {
  return update.mock.calls
    .map((call) => call[0] as Resource)
    .find((resource): resource is T => resource.resourceType === resourceType);
}

const draftPrescription = (id = 'mr-1'): MedicationRequest => ({
  resourceType: 'MedicationRequest',
  id,
  status: 'draft',
  intent: 'order',
  subject: { reference: 'Patient/p1' },
  medicationCodeableConcept: { text: 'Metformine 500 mg' },
});

describe('M5ServicesService', () => {
  let fhir: { read: jest.Mock; create: jest.Mock; update: jest.Mock; search: jest.Mock };
  let notifications: { notify: jest.Mock };
  let events: { recentEvents: jest.Mock; emit: jest.Mock };
  let config: { get: jest.Mock };
  let service: M5ServicesService;

  beforeEach(() => {
    const seq: Record<string, number> = {};
    fhir = {
      read: jest.fn().mockResolvedValue({ resourceType: 'Patient', id: 'p1', gender: 'male' }),
      create: jest.fn().mockImplementation(async (resource: Resource) => {
        const type = resource.resourceType;
        seq[type] = (seq[type] ?? 0) + 1;
        return { ...resource, id: `${type.toLowerCase()}-${seq[type]}` };
      }),
      update: jest.fn().mockImplementation(async (resource: Resource) => resource),
      search: jest.fn().mockResolvedValue(searchset([])),
    };
    notifications = {
      notify: jest
        .fn()
        .mockResolvedValue({ channels: ['sms', 'in-app'], smsAccepted: true, smsProvider: 'console' }),
    };
    events = { recentEvents: jest.fn().mockReturnValue([]), emit: jest.fn() };
    config = { get: jest.fn().mockReturnValue('+212600000002') };

    service = new M5ServicesService(
      fhir as unknown as FhirService,
      notifications as unknown as NotificationService,
      events as unknown as DomainEventBus,
      config as unknown as import('@nestjs/config').ConfigService,
    );
  });

  describe('createMedicationRequest — pharmacy order', () => {
    it('creates a draft/order MedicationRequest with dosage + dispense quantity', async () => {
      const result = await service.createMedicationRequest({
        patientId: 'p1',
        medication: 'Metformine 500 mg',
        dosageInstruction: '1 comprimé matin et soir',
        quantity: 60,
        quantityUnit: 'comprimé',
      });

      // Patient existence is checked first (anchors the AuditEvent).
      expect(fhir.read).toHaveBeenCalledWith('Patient', 'p1');

      const mr = created<MedicationRequest>(fhir.create, 'MedicationRequest');
      expect(mr?.status).toBe('draft');
      expect(mr?.intent).toBe('order');
      expect(mr?.subject?.reference).toBe('Patient/p1');
      expect(mr?.medicationCodeableConcept?.text).toBe('Metformine 500 mg');
      expect(mr?.dosageInstruction?.[0]?.text).toBe('1 comprimé matin et soir');
      expect(mr?.dispenseRequest?.quantity?.value).toBe(60);
      expect(mr?.dispenseRequest?.quantity?.unit).toBe('comprimé');

      // Availability is returned and is a valid (deterministic) stock status.
      expect(Object.values(StockStatus)).toContain(result.availability.status);
      expect(result.availability.status).toBe(simulateStock('Metformine 500 mg').status);
    });
  });

  describe('validatePrescription — §6 Physician/Pharmacist', () => {
    it('approve → status active + appends a note', async () => {
      fhir.read.mockResolvedValueOnce(draftPrescription('mr-7'));
      const result = await service.validatePrescription('mr-7', { decision: 'approve' });
      expect(result.status).toBe('active');
      expect(result.note?.at(-1)?.text).toContain('validée');
      // Returns the raw resource so the AuditInterceptor anchors via subject.
      expect(result.subject?.reference).toBe('Patient/p1');
    });

    it('reject → status cancelled with the supplied reason', async () => {
      fhir.read.mockResolvedValueOnce(draftPrescription('mr-7'));
      const result = await service.validatePrescription('mr-7', {
        decision: 'reject',
        note: 'Interaction médicamenteuse',
      });
      expect(result.status).toBe('cancelled');
      expect(result.note?.at(-1)?.text).toBe('Interaction médicamenteuse');
    });

    it('rejects validation when the prescription is not a draft', async () => {
      fhir.read.mockResolvedValueOnce({ ...draftPrescription('mr-7'), status: 'active' });
      await expect(service.validatePrescription('mr-7', { decision: 'approve' })).rejects.toThrow(
        /not awaiting validation/i,
      );
      expect(fhir.update).not.toHaveBeenCalled();
    });
  });

  describe('listPrescriptions — pharmacist queue', () => {
    it('projects prescriptions with simulated availability', async () => {
      fhir.search.mockResolvedValueOnce(searchset([draftPrescription('mr-1')]));
      const result = await service.listPrescriptions('draft');
      expect(fhir.search).toHaveBeenCalledWith(
        'MedicationRequest',
        expect.objectContaining({ status: 'draft' }),
      );
      expect(result.total).toBe(1);
      expect(result.prescriptions[0]?.medication).toBe('Metformine 500 mg');
      expect(Object.values(StockStatus)).toContain(result.prescriptions[0]?.availability.status);
    });
  });

  describe('createServiceRequest — lab/imaging order', () => {
    it('creates an active ServiceRequest with a SNOMED category + LOINC code', async () => {
      const sr = await service.createServiceRequest({
        patientId: 'p1',
        category: ServiceCategory.LABORATORY,
        display: 'HbA1c',
        loinc: '4548-4',
      });
      expect(sr.status).toBe('active');
      expect(sr.intent).toBe('order');
      expect(sr.category?.[0]?.coding?.[0]?.code).toBe(ServiceCategorySnomed.laboratory);
      expect(sr.code?.coding?.[0]?.system).toBe(CodeSystems.LOINC);
      expect(sr.code?.coding?.[0]?.code).toBe('4548-4');
    });
  });

  describe('createDiagnosticReport — §6 Lab-Technician adds results', () => {
    it('auto-derives abnormal from §7 thresholds and notifies the ordering physician (PHI-safe)', async () => {
      const result = await service.createDiagnosticReport({
        patientId: 'p1',
        category: ServiceCategory.LABORATORY,
        loinc: '4548-4', // HbA1c, §7 rule: > 7 is abnormal
        display: 'HbA1c',
        value: 8.5,
        unit: '%',
      });

      expect(result.abnormal).toBe(true);

      // Observation + DiagnosticReport carry the abnormal interpretation.
      const obs = created<Observation>(fhir.create, 'Observation');
      expect(obs?.status).toBe('final');
      expect(obs?.valueQuantity?.value).toBe(8.5);
      expect(obs?.interpretation?.[0]?.coding?.[0]?.code).toBe('A');

      const report = created<DiagnosticReport>(fhir.create, 'DiagnosticReport');
      expect(report?.extension?.find((e) => e.url === HphiiUrls.RESULT_INTERPRETATION)?.valueCode).toBe('A');
      expect(report?.result?.[0]?.reference).toBe('Observation/observation-1');

      // Ordering physician notified, in-app + SMS, urgent.
      expect(notifications.notify).toHaveBeenCalledTimes(1);
      const note = notifications.notify.mock.calls[0][0];
      expect(note.kind).toBe('result.abnormal');
      expect(note.to).toBe('+212600000002');
      expect(note.urgent).toBe(true);
      expect(note.diagnosticReportId).toBe('diagnosticreport-1');
      // PHI-safe: the measured value must never appear in the notification body.
      expect(note.body).not.toContain('8.5');
      expect(result.notification?.smsAccepted).toBe(true);
    });

    it('does not notify when the result is within range', async () => {
      const result = await service.createDiagnosticReport({
        patientId: 'p1',
        category: ServiceCategory.LABORATORY,
        loinc: '4548-4',
        display: 'HbA1c',
        value: 5.2,
        unit: '%',
      });
      expect(result.abnormal).toBe(false);
      expect(notifications.notify).not.toHaveBeenCalled();
      const report = created<DiagnosticReport>(fhir.create, 'DiagnosticReport');
      expect(report?.extension?.find((e) => e.url === HphiiUrls.RESULT_INTERPRETATION)?.valueCode).toBe('N');
    });

    it('honours an explicit abnormal flag for a textual (imaging) result + completes the order', async () => {
      // read #1 = Patient, read #2 = the ServiceRequest being fulfilled.
      fhir.read
        .mockResolvedValueOnce({ resourceType: 'Patient', id: 'p1', gender: 'female' })
        .mockResolvedValueOnce({
          resourceType: 'ServiceRequest',
          id: 'sr-9',
          status: 'active',
          intent: 'order',
          subject: { reference: 'Patient/p1' },
        } as ServiceRequest);

      const result = await service.createDiagnosticReport({
        patientId: 'p1',
        serviceRequestId: 'sr-9',
        category: ServiceCategory.IMAGING,
        loinc: '36643-5',
        display: 'Radiographie thoracique',
        valueText: 'Opacité du lobe inférieur droit',
        abnormal: true,
      });

      expect(result.abnormal).toBe(true);
      expect(notifications.notify).toHaveBeenCalledTimes(1);

      const obs = created<Observation>(fhir.create, 'Observation');
      expect(obs?.valueString).toBe('Opacité du lobe inférieur droit');

      const report = created<DiagnosticReport>(fhir.create, 'DiagnosticReport');
      expect(report?.basedOn?.[0]?.reference).toBe('ServiceRequest/sr-9');

      // The originating order was closed.
      const order = updated<ServiceRequest>(fhir.update, 'ServiceRequest');
      expect(order?.status).toBe('completed');
    });

    it('requires a numeric value or a textual result', async () => {
      await expect(
        service.createDiagnosticReport({
          patientId: 'p1',
          category: ServiceCategory.LABORATORY,
          loinc: '4548-4',
        }),
      ).rejects.toThrow(/required/i);
      expect(fhir.create).not.toHaveBeenCalled();
    });
  });

  describe('recentAbnormalNotifications', () => {
    it('returns only result.abnormal events', () => {
      events.recentEvents.mockReturnValue([
        { kind: 'alert.created', at: 't', message: 'x' },
        { kind: 'result.abnormal', at: 't', message: 'y', diagnosticReportId: 'dr-1' },
      ]);
      const out = service.recentAbnormalNotifications();
      expect(out).toHaveLength(1);
      expect(out[0]?.kind).toBe('result.abnormal');
    });
  });

  describe('simulateStock — deterministic PoC inventory', () => {
    it('is stable across calls and maps onHand → status', () => {
      const a = simulateStock('Amoxicilline');
      const b = simulateStock('Amoxicilline');
      expect(a).toEqual(b);
      expect(a.available).toBe(a.status !== StockStatus.OUT_OF_STOCK);
    });
  });
});
