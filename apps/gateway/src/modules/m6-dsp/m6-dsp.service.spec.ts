import type { Bundle, DocumentReference, Resource } from 'fhir/r4';
import { ALL_ROLES, allowedResourcesForRole, HphiiUrls, Role } from '@hphii/fhir-domain';

import type { FhirService } from '../../core/fhir';
import { M6DspService } from './m6-dsp.service';

/** A Patient/$everything-style bundle carrying one of every resource type. */
function everythingBundle(): Bundle {
  const types = [
    'Patient',
    'Encounter',
    'Coverage',
    'Task',
    'Observation',
    'DetectedIssue',
    'CarePlan',
    'DocumentReference',
    'DiagnosticReport',
    'MedicationRequest',
    'AuditEvent',
  ];
  const entry = types.map((type, i) => ({
    resource: { resourceType: type, id: `${type}-${i}` } as unknown as Resource,
  })) as unknown as Bundle['entry'];
  return { resourceType: 'Bundle', type: 'searchset', entry };
}

/** Distinct resource types present in a bundle, sorted. */
function typesIn(bundle: Bundle): string[] {
  const set = new Set<string>();
  for (const entry of bundle.entry ?? []) {
    const type = entry.resource?.resourceType;
    if (type) set.add(type);
  }
  return [...set].sort();
}

describe('M6DspService', () => {
  let fhir: {
    operationEverything: jest.Mock;
    read: jest.Mock;
    create: jest.Mock;
    search: jest.Mock;
  };
  let service: M6DspService;

  beforeEach(() => {
    fhir = {
      operationEverything: jest.fn().mockResolvedValue(everythingBundle()),
      read: jest.fn().mockResolvedValue({ resourceType: 'Patient', id: 'p1' }),
      create: jest.fn().mockImplementation(async (resource: Resource) => ({ ...resource, id: 'created-1' })),
      search: jest.fn(),
    };
    service = new M6DspService(fhir as unknown as FhirService);
  });

  describe('getRecord — role → resource filter (§6)', () => {
    it('Physician sees the full clinical set', async () => {
      const bundle = await service.getRecord('p1', Role.PHYSICIAN);
      expect(typesIn(bundle)).toEqual([
        'CarePlan',
        'DetectedIssue',
        'DocumentReference',
        'Observation',
        'Patient',
      ]);
    });

    it('Nurse sees Patient + Observation + DetectedIssue', async () => {
      const bundle = await service.getRecord('p1', Role.NURSE);
      expect(typesIn(bundle)).toEqual(['DetectedIssue', 'Observation', 'Patient']);
    });

    it('Lab-Technician sees DiagnosticReport only', async () => {
      const bundle = await service.getRecord('p1', Role.LAB_TECHNICIAN);
      expect(typesIn(bundle)).toEqual(['DiagnosticReport']);
    });

    it('Pharmacist sees MedicationRequest only', async () => {
      const bundle = await service.getRecord('p1', Role.PHARMACIST);
      expect(typesIn(bundle)).toEqual(['MedicationRequest']);
    });

    it('Admin sees Patient + AuditEvent', async () => {
      const bundle = await service.getRecord('p1', Role.ADMIN);
      expect(typesIn(bundle)).toEqual(['AuditEvent', 'Patient']);
    });

    it('Physician and Lab-Technician bundles differ exactly per the matrix', async () => {
      const physician = await service.getRecord('p1', Role.PHYSICIAN);
      const lab = await service.getRecord('p1', Role.LAB_TECHNICIAN);
      expect(typesIn(physician)).not.toEqual(typesIn(lab));
      const overlap = typesIn(physician).filter((type) => typesIn(lab).includes(type));
      expect(overlap).toEqual([]);
    });

    it('tags the Bundle with the RBAC-filter system and a consistent total', async () => {
      const bundle = await service.getRecord('p1', Role.PHYSICIAN);
      const tag = bundle.meta?.tag?.[0];
      expect(tag?.system).toBe(HphiiUrls.RBAC_FILTER);
      expect(tag?.code).toBe(Role.PHYSICIAN);
      expect(bundle.total).toBe(bundle.entry?.length);
    });

    // Exhaustive guard: for EVERY role the filtered bundle must contain exactly
    // the resource types the §6 domain filter allows — nothing more (no PHI leak),
    // nothing less. Source-of-truth is allowedResourcesForRole, so this fails if
    // the gateway filter and the domain matrix ever drift apart.
    describe.each(ALL_ROLES)('role %s bundle obeys allowedResourcesForRole', (role) => {
      it('contains exactly the allowed types (the everything bundle has one of each)', async () => {
        const bundle = await service.getRecord('p1', role);
        const expected = [...allowedResourcesForRole(role)].sort();
        expect(typesIn(bundle)).toEqual(expected);
      });

      it('leaks no resource type outside the role filter', async () => {
        const bundle = await service.getRecord('p1', role);
        const allowed = new Set<string>(allowedResourcesForRole(role));
        const leaked = typesIn(bundle).filter((type) => !allowed.has(type));
        expect(leaked).toEqual([]);
      });
    });
  });

  describe('exportDocument', () => {
    it('reads the patient then creates a DocumentReference summary', async () => {
      const doc = await service.exportDocument('p1', {
        title: 'Résumé',
        description: 'Export',
        contentText: 'hello',
      });
      expect(fhir.read).toHaveBeenCalledWith('Patient', 'p1');
      const created = fhir.create.mock.calls[0][0] as DocumentReference;
      expect(created.resourceType).toBe('DocumentReference');
      expect(created.status).toBe('current');
      expect(created.subject?.reference).toBe('Patient/p1');
      expect(created.content?.[0]?.attachment?.data).toBe(
        Buffer.from('hello', 'utf8').toString('base64'),
      );
      expect(doc.id).toBe('created-1');
    });
  });

  describe('getAuditTrail', () => {
    it('queries AuditEvents by patient entity and projects PHI-safe rows', async () => {
      fhir.search.mockResolvedValue({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          {
            resource: {
              resourceType: 'AuditEvent',
              id: 'ae1',
              action: 'R',
              recorded: '2026-01-01T00:00:00Z',
              outcome: '0',
              agent: [
                { type: { coding: [{ code: 'Physician' }] }, who: { identifier: { value: 'user-1' } } },
              ],
              entity: [{ what: { reference: 'Patient/p1' } }],
            },
          },
        ],
      });
      const trail = await service.getAuditTrail('p1');
      expect(fhir.search).toHaveBeenCalledWith(
        'AuditEvent',
        expect.objectContaining({ entity: 'Patient/p1' }),
      );
      expect(trail.total).toBe(1);
      expect(trail.events[0]).toMatchObject({
        id: 'ae1',
        action: 'R',
        actorRole: 'Physician',
        actorId: 'user-1',
        outcome: '0',
        entity: 'Patient/p1',
      });
    });
  });
});
