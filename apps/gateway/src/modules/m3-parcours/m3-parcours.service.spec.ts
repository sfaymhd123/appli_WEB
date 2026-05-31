import type {
  Bundle,
  CarePlan,
  CareTeam,
  Condition,
  Encounter,
  FhirResource,
  Flag,
  Goal,
  Resource,
} from 'fhir/r4';
import { CarePlanReviewStatus, PathwayType } from '@hphii/fhir-domain';

import type { FhirService } from '../../core/fhir';
import { M3ParcoursService } from './m3-parcours.service';
import { buildReviewExtension, readReview, REVIEW_FLAG_CODE } from './pathway-engine';

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

const activeCarePlan = (id = 'cp-1'): CarePlan => ({
  resourceType: 'CarePlan',
  id,
  status: 'active',
  intent: 'plan',
  subject: { reference: 'Patient/p1' },
});

describe('M3ParcoursService', () => {
  let fhir: {
    read: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    search: jest.Mock;
  };
  let service: M3ParcoursService;

  beforeEach(() => {
    const seq: Record<string, number> = {};
    fhir = {
      read: jest.fn().mockResolvedValue({ resourceType: 'Patient', id: 'p1' }),
      // Echo the resource back with a deterministic, type-scoped id so that
      // references built after creation resolve in the projections.
      create: jest.fn().mockImplementation(async (resource: Resource) => {
        const type = resource.resourceType;
        seq[type] = (seq[type] ?? 0) + 1;
        return { ...resource, id: `${type.toLowerCase()}-${seq[type]}` };
      }),
      update: jest.fn().mockImplementation(async (resource: Resource) => resource),
      search: jest.fn().mockResolvedValue(searchset([])),
    };
    service = new M3ParcoursService(fhir as unknown as FhirService);
  });

  describe('createCarePlan — chronic (M3a)', () => {
    it('links Conditions, Goals, CareTeam and activities into an active CarePlan', async () => {
      const result = await service.createCarePlan({
        patientId: 'p1',
        title: 'Diabète type 2',
        description: 'Suivi chronique',
        conditions: [{ display: 'Type 2 diabetes mellitus', code: '44054006' }],
        goals: ['HbA1c < 7%'],
        activities: [{ description: 'Mesure glycémie hebdomadaire' }],
        careTeam: [{ name: 'Dr Alaoui', role: 'Médecin référent' }],
      });

      // Patient existence is checked first (anchors the AuditEvent).
      expect(fhir.read).toHaveBeenCalledWith('Patient', 'p1');

      // A problem-list Condition was created for the diagnosis.
      const condition = created<Condition>(fhir.create, 'Condition');
      expect(condition?.category?.[0]?.coding?.[0]?.code).toBe('problem-list-item');
      expect(condition?.code?.coding?.[0]?.code).toBe('44054006');

      // A Goal and a CareTeam were created.
      expect(created<Goal>(fhir.create, 'Goal')?.description?.text).toBe('HbA1c < 7%');
      expect(created<CareTeam>(fhir.create, 'CareTeam')?.participant?.[0]?.member?.display).toBe(
        'Dr Alaoui',
      );

      // The CarePlan is active/plan and references the created resources.
      const carePlan = created<CarePlan>(fhir.create, 'CarePlan');
      expect(carePlan?.status).toBe('active');
      expect(carePlan?.intent).toBe('plan');
      expect(carePlan?.addresses?.[0]?.reference).toBe('Condition/condition-1');
      expect(carePlan?.goal?.[0]?.reference).toBe('Goal/goal-1');
      expect(carePlan?.careTeam?.[0]?.reference).toBe('CareTeam/careteam-1');
      expect(carePlan?.activity?.[0]?.detail?.description).toBe('Mesure glycémie hebdomadaire');
      expect(carePlan?.activity?.[0]?.detail?.status).toBe('not-started');

      // The projection resolves the linked resources back to human-readable fields.
      expect(result.summary.status).toBe('active');
      expect(result.summary.goals).toEqual(['HbA1c < 7%']);
      expect(result.summary.careTeam).toEqual(['Dr Alaoui']);
      expect(result.summary.conditions).toHaveLength(1);
      expect(result.summary.conditions[0]?.display).toBe('Type 2 diabetes mellitus');
      expect(result.summary.review.needed).toBe(false);
    });
  });

  describe('handleReviewNeeded — reacts to M4 HbA1c>7 (§8)', () => {
    it('flags every active CarePlan and creates a review Flag', async () => {
      fhir.search
        .mockResolvedValueOnce(searchset([activeCarePlan()])) // CarePlan?subject
        .mockResolvedValueOnce(searchset([])); // Flag?status=active (none yet)

      const count = await service.handleReviewNeeded('Patient/p1', 'Revue requise (HbA1c).');

      expect(count).toBe(1);

      // The CarePlan was updated with the review marker = Needed.
      const cp = updated<CarePlan>(fhir.update, 'CarePlan');
      const review = readReview(cp?.extension);
      expect(review.needed).toBe(true);
      expect(review.status).toBe(CarePlanReviewStatus.NEEDED);
      expect(review.reason).toBe('Revue requise (HbA1c).');
      expect(review.requestedAt).toBeDefined();

      // A clinical review Flag was raised on the patient.
      const flag = created<Flag>(fhir.create, 'Flag');
      expect(flag?.status).toBe('active');
      expect(flag?.code?.coding?.[0]?.code).toBe(REVIEW_FLAG_CODE);
    });

    it('does not create a second Flag when one already exists (idempotent)', async () => {
      const existingFlag: Flag = {
        resourceType: 'Flag',
        id: 'flag-1',
        status: 'active',
        code: { coding: [{ code: REVIEW_FLAG_CODE }] },
        subject: { reference: 'Patient/p1' },
      };
      fhir.search
        .mockResolvedValueOnce(searchset([activeCarePlan()])) // CarePlan
        .mockResolvedValueOnce(searchset([existingFlag])); // Flag already present

      await service.handleReviewNeeded('Patient/p1', 'Revue requise.');

      expect(created<Flag>(fhir.create, 'Flag')).toBeUndefined();
    });
  });

  describe('acknowledgeReview — clears the marker (§8)', () => {
    it('sets review = Cleared and inactivates the patient review Flags', async () => {
      const planNeedingReview: CarePlan = {
        ...activeCarePlan('cp-7'),
        extension: [
          buildReviewExtension({
            status: CarePlanReviewStatus.NEEDED,
            reason: 'HbA1c',
            requestedAt: '2026-05-01T00:00:00.000Z',
          }),
        ],
      };
      fhir.read.mockResolvedValueOnce(planNeedingReview);
      fhir.search.mockResolvedValueOnce(
        searchset([
          {
            resourceType: 'Flag',
            id: 'flag-1',
            status: 'active',
            code: { coding: [{ code: REVIEW_FLAG_CODE }] },
            subject: { reference: 'Patient/p1' },
          } as Flag,
        ]),
      );

      const result = await service.acknowledgeReview('cp-7');

      const review = readReview(result.extension);
      expect(review.needed).toBe(false);
      expect(review.status).toBe(CarePlanReviewStatus.CLEARED);
      expect(review.clearedAt).toBeDefined();

      // The active review Flag was set inactive.
      const flag = updated<Flag>(fhir.update, 'Flag');
      expect(flag?.status).toBe('inactive');
    });
  });

  describe('createEpisode — episodic (M3b)', () => {
    it('opens an in-progress Encounter with encounter-diagnosis Conditions', async () => {
      fhir.read.mockResolvedValueOnce({ resourceType: 'Patient', id: 'p2' });

      const result = await service.createEpisode({
        patientId: 'p2',
        complaint: 'Douleur thoracique',
        conditions: [{ display: 'Chest pain' }],
        emergency: true,
      });

      const encounter = created<Encounter>(fhir.create, 'Encounter');
      expect(encounter?.status).toBe('in-progress');
      expect(encounter?.class?.code).toBe('EMER');
      expect(encounter?.subject?.reference).toBe('Patient/p2');

      const condition = created<Condition>(fhir.create, 'Condition');
      expect(condition?.category?.[0]?.coding?.[0]?.code).toBe('encounter-diagnosis');
      expect(condition?.encounter?.reference).toBe('Encounter/encounter-1');

      expect(result.summary.status).toBe('in-progress');
      expect(result.summary.active).toBe(true);
      expect(result.summary.conditions).toHaveLength(1);
    });
  });

  describe('switchToChronic — M3b → M3a', () => {
    it('opens a CarePlan addressing the episode Conditions and finishes the episode', async () => {
      fhir.read.mockResolvedValueOnce({
        resourceType: 'Encounter',
        id: 'enc-9',
        status: 'in-progress',
        subject: { reference: 'Patient/p3' },
      } as Encounter);
      fhir.search.mockResolvedValueOnce(
        searchset([
          {
            resourceType: 'Condition',
            id: 'c-77',
            code: { text: 'Hypertension' },
            subject: { reference: 'Patient/p3' },
            encounter: { reference: 'Encounter/enc-9' },
          } as Condition,
        ]),
      );

      const result = await service.switchToChronic('enc-9', {
        title: 'Suivi chronique HTA',
        goals: ['TA < 140/90'],
        closeEpisode: true,
      });

      // The new CarePlan addresses the existing episode Condition and links the origin Encounter.
      const carePlan = created<CarePlan>(fhir.create, 'CarePlan');
      expect(carePlan?.subject?.reference).toBe('Patient/p3');
      expect(carePlan?.addresses?.[0]?.reference).toBe('Condition/c-77');
      expect(carePlan?.encounter?.reference).toBe('Encounter/enc-9');
      expect(carePlan?.goal?.[0]?.reference).toBe('Goal/goal-1');

      // The originating episode was finished.
      const encounter = updated<Encounter>(fhir.update, 'Encounter');
      expect(encounter?.status).toBe('finished');
      expect(encounter?.period?.end).toBeDefined();

      expect(result.summary.conditions).toHaveLength(1);
    });

    it('keeps the episode open when closeEpisode is false', async () => {
      fhir.read.mockResolvedValueOnce({
        resourceType: 'Encounter',
        id: 'enc-9',
        status: 'in-progress',
        subject: { reference: 'Patient/p3' },
      } as Encounter);

      await service.switchToChronic('enc-9', { closeEpisode: false });

      expect(updated<Encounter>(fhir.update, 'Encounter')).toBeUndefined();
    });
  });

  describe('closeCarePlan / closeEpisode', () => {
    it('completes a CarePlan and appends a note', async () => {
      fhir.read.mockResolvedValueOnce(activeCarePlan('cp-3'));
      const result = await service.closeCarePlan('cp-3', { reason: 'Objectifs atteints' });
      expect(result.status).toBe('completed');
      expect(result.note?.[0]?.text).toContain('Objectifs atteints');
    });

    it('revokes a CarePlan when cancelled', async () => {
      fhir.read.mockResolvedValueOnce(activeCarePlan('cp-3'));
      const result = await service.closeCarePlan('cp-3', { cancelled: true });
      expect(result.status).toBe('revoked');
    });

    it('finishes an episode and stamps period.end', async () => {
      fhir.read.mockResolvedValueOnce({
        resourceType: 'Encounter',
        id: 'enc-2',
        status: 'in-progress',
        subject: { reference: 'Patient/p1' },
      } as Encounter);
      const result = await service.closeEpisode('enc-2', {});
      expect(result.status).toBe('finished');
      expect(result.period?.end).toBeDefined();
    });
  });

  describe('getPathway — classification (§2: chronic wins)', () => {
    it('reports chronic when an active CarePlan and an active Encounter coexist', async () => {
      fhir.search.mockImplementation(async (type: string) => {
        if (type === 'CarePlan') return searchset([activeCarePlan()]);
        if (type === 'Encounter') {
          return searchset([
            {
              resourceType: 'Encounter',
              id: 'e-1',
              status: 'in-progress',
              subject: { reference: 'Patient/p1' },
            } as Encounter,
          ]);
        }
        return searchset([]);
      });

      const result = await service.getPathway('p1');
      expect(result.classification).toBe(PathwayType.CHRONIC);
      expect(result.chronic).toBe(true);
      expect(result.episodic).toBe(true);
      expect(result.activeCarePlan).toBeDefined();
      expect(result.activeEpisode).toBeDefined();
    });

    it('reports episodic when only an active Encounter exists', async () => {
      fhir.search.mockImplementation(async (type: string) => {
        if (type === 'Encounter') {
          return searchset([
            {
              resourceType: 'Encounter',
              id: 'e-1',
              status: 'in-progress',
              subject: { reference: 'Patient/p1' },
            } as Encounter,
          ]);
        }
        return searchset([]);
      });

      const result = await service.getPathway('p1');
      expect(result.classification).toBe(PathwayType.EPISODIC);
      expect(result.chronic).toBe(false);
      expect(result.episodic).toBe(true);
    });

    it('reports none when nothing is active', async () => {
      fhir.search.mockImplementation(async (type: string) => {
        if (type === 'CarePlan') {
          return searchset([{ ...activeCarePlan(), status: 'completed' } as CarePlan]);
        }
        if (type === 'Encounter') {
          return searchset([
            {
              resourceType: 'Encounter',
              id: 'e-1',
              status: 'finished',
              subject: { reference: 'Patient/p1' },
            } as Encounter,
          ]);
        }
        return searchset([]);
      });

      const result = await service.getPathway('p1');
      expect(result.classification).toBe(PathwayType.NONE);
      expect(result.chronic).toBe(false);
      expect(result.episodic).toBe(false);
    });
  });
});
