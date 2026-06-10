import { resolve } from 'node:path';

import type { AuditEvent, Bundle, DetectedIssue, DiagnosticReport, Encounter, FhirResource, Patient } from 'fhir/r4';
import { AcknowledgementStatus, HphiiUrls, Role } from '@hphii/fhir-domain';

import type { FhirService } from '../../core/fhir';
import { AnalyticsService } from './analytics.service';
import type { KpiReport } from './analytics.types';

// Mock only the IO loader; keep the pure mapSeedKpis implementation real.
jest.mock('./kpi-fallback', () => {
  const actual = jest.requireActual('./kpi-fallback');
  return { ...actual, loadSeedKpis: jest.fn() };
});
import { loadSeedKpis, mapSeedKpis, type SeedKpis } from './kpi-fallback';

const loadSeedKpisMock = loadSeedKpis as jest.Mock;

/** A FHIR searchset Bundle of resources (the shape `search` returns for tallies). */
function searchset(resources: FhirResource[]): Bundle {
  return { resourceType: 'Bundle', type: 'searchset', entry: resources.map((resource) => ({ resource })) };
}

/** A count-only Bundle (the shape `_summary=count` returns). */
const countset = (total: number): Bundle => ({ resourceType: 'Bundle', type: 'searchset', total });

const patient = (zone?: string, risk?: string): Patient => ({
  resourceType: 'Patient',
  extension: [
    ...(zone ? [{ url: HphiiUrls.ZONE_TYPE, valueString: zone }] : []),
    ...(risk ? [{ url: HphiiUrls.RISK_GROUP, valueString: risk }] : []),
  ],
});

const encounter = (priority?: string): Encounter => ({
  resourceType: 'Encounter',
  status: 'finished',
  class: { code: 'AMB' },
  ...(priority ? { extension: [{ url: HphiiUrls.TRIAGE_PRIORITY, valueString: priority }] } : {}),
});

const report = (abnormal: boolean): DiagnosticReport => ({
  resourceType: 'DiagnosticReport',
  status: 'final',
  code: {},
  extension: [{ url: HphiiUrls.RESULT_INTERPRETATION, valueCode: abnormal ? 'A' : 'N' }],
});

const issue = (ack?: string): DetectedIssue => ({
  resourceType: 'DetectedIssue',
  status: 'registered',
  code: {},
  ...(ack ? { extension: [{ url: HphiiUrls.ACKNOWLEDGEMENT_STATUS, valueString: ack }] } : {}),
});

/** An AuditEvent with a single agent whose role coding is `role` (or none/foreign). */
function audit(role: string | null, system: string = HphiiUrls.RBAC_ROLES): AuditEvent {
  return {
    resourceType: 'AuditEvent',
    type: { system: 'http://dicom.nema.org/resources/ontology/DCM', code: '110110' },
    recorded: '2026-01-01T00:00:00.000Z',
    source: { observer: { display: 'gateway' } },
    agent: [
      {
        requestor: true,
        ...(role ? { type: { coding: [{ system, code: role }] } } : {}),
      },
    ],
  };
}

/** Live counts returned for `_summary=count` searches, keyed by resourceType. */
const LIVE_COUNTS: Record<string, number> = {
  Patient: 3,
  CarePlan: 2,
  Encounter: 5,
  Observation: 10,
  MedicationRequest: 1,
};

/** A search mock that dispatches on (resourceType, _summary) for the live path. */
function liveSearch(): jest.Mock {
  return jest.fn(async (type: string, params: Record<string, unknown> = {}) => {
    if (params._summary === 'count' || params._summary === 'true') {
      if (type === 'MedicationRequest' && params.status) {
        return countset(params.status === 'active' ? 1 : 0);
      }
      return countset(LIVE_COUNTS[type] ?? 0);
    }
    switch (type) {
      case 'Patient':
        return searchset([
          patient('Rural', 'Elderly'),
          patient('Rural', 'Chronic-risk'),
          patient('Urban', 'Standard'),
        ]);
      case 'Encounter':
        // 2×P1, 1×P3, plus one un-triaged Encounter (no priority extension).
        return searchset([encounter('P1'), encounter('P1'), encounter('P3'), encounter()]);
      case 'DiagnosticReport':
        return searchset([report(true), report(false), report(false), report(false)]);
      case 'DetectedIssue':
        return searchset([
          issue(AcknowledgementStatus.ACKNOWLEDGED),
          issue(AcknowledgementStatus.ESCALATED),
          issue(AcknowledgementStatus.PENDING),
          issue(), // missing status → counted as pending
        ]);
      case 'AuditEvent':
        return searchset([
          audit(Role.PHYSICIAN),
          audit(Role.PHYSICIAN),
          audit(Role.NURSE),
          audit('Bogus'), // unknown role code → ignored
          audit(Role.ADMIN, 'http://example.org/other'), // foreign system → ignored
        ]);
      default:
        return searchset([]);
    }
  });
}

function makeService(search: jest.Mock): AnalyticsService {
  const fhir = { search } as unknown as FhirService;
  const prisma = {
    user: {
      count: jest.fn().mockResolvedValue(5),
      groupBy: jest.fn().mockResolvedValue([
        { role: Role.PHYSICIAN, _count: { id: 2 } },
        { role: Role.NURSE, _count: { id: 1 } },
        { role: Role.ADMIN, _count: { id: 1 } },
        { role: Role.PHARMACIST, _count: { id: 1 } },
      ]),
    },
  } as unknown as any;
  return new AnalyticsService(fhir, prisma);
}

describe('AnalyticsService', () => {
  beforeEach(() => loadSeedKpisMock.mockReset());

  describe('getKpis (live aggregation)', () => {
    it('aggregates cohort, pathway, triage, monitoring, results, alerts and DSP access', async () => {
      const service = makeService(liveSearch());
      const kpis = await service.getKpis(Role.ADMIN, 'admin-id');

      expect(kpis.source).toBe('live');
      expect(kpis.cohortSize).toBe(3);
      expect(kpis.staffCount).toBe(5);

      // demographics: 2 Rural, 1 Urban; 1 Elderly, 1 Chronic-risk, 1 Standard
      expect(kpis.demographics.byZone).toMatchObject({ Rural: 2, Urban: 1, 'Peri-urban': 0 });
      expect(kpis.demographics.byRiskGroup).toMatchObject({
        Elderly: 1,
        'Chronic-risk': 1,
        Standard: 1,
        Pediatric: 0,
      });

      // pathway: chronic=CarePlan(2), episodic=Encounter(5) → 7 total
      expect(kpis.pathwayMix).toMatchObject({
        chronic: 2,
        episodic: 5,
        total: 7,
        chronicPct: 28.6,
        episodicPct: 71.4,
      });

      // triage: only the 3 triaged encounters count; P1 share = 2/3
      expect(kpis.triage.byPriority).toMatchObject({ P1: 2, P2: 0, P3: 1, P4: 0, P5: 0 });
      expect(kpis.triage.total).toBe(3);
      expect(kpis.triage.criticalPct).toBe(66.7);

      // monitoring volume = Observation count
      expect(kpis.monitoring.observations).toBe(10);

      // results: 1 of 4 abnormal
      expect(kpis.results).toEqual({ total: 4, abnormal: 1, pending: 0, abnormalPct: 25 });

      // medications: 1 total, already validated
      expect(kpis.medications).toEqual({
        total: 1,
        pending: 0,
        completed: 1,
        approved: 1,
        rejected: 0,
      });

      // alerts: ack=1, escalated=1, pending=2 (one explicit + one missing) → total 4
      expect(kpis.alerts).toEqual({
        total: 4,
        acknowledged: 1,
        pending: 2,
        escalated: 1,
        acknowledgedPct: 25,
        pendingPct: 50,
        escalatedPct: 25,
        unacknowledgedPct: 75,
      });

      // DSP access: only RBAC-system codings with a known role are tallied
      expect(kpis.dspAccessByRole).toEqual({
        Physician: 2,
        Nurse: 1,
        Admin: 0,
        Pharmacist: 0,
        'Lab-Technician': 0,
      });

      expect(loadSeedKpisMock).not.toHaveBeenCalled();
    });

    it('uses _summary=count for the cohort/pathway/monitoring totals', async () => {
      const search = liveSearch();
      await makeService(search).getKpis(Role.ADMIN, 'admin-id');

      const countCalls = search.mock.calls.filter(([, params]) => params?._summary === 'count');
      const countedTypes = countCalls.map(([type]) => type);
      expect(countedTypes).toEqual(expect.arrayContaining(['Patient', 'CarePlan', 'Encounter', 'Observation']));
    });

    it('backfills an empty role slice with scaled seed KPIs for dashboard cards', async () => {
      loadSeedKpisMock.mockReturnValue({
        source: 'seed',
        generatedAt: '2026-05-30T15:40:00+00:00',
        cohortSize: 371,
        staffCount: 5,
        staffDistribution: { Physician: 1, Nurse: 1, Admin: 1, Pharmacist: 1, 'Lab-Technician': 1 },
        demographics: {
          byZone: { Rural: 100, Urban: 200, 'Peri-urban': 71 },
          byRiskGroup: { Standard: 200, 'Chronic-risk': 100, Elderly: 50, Pediatric: 21 },
        },
        pathwayMix: { chronic: 232, episodic: 299, total: 531, chronicPct: 43.7, episodicPct: 56.3 },
        triage: { byPriority: { P1: 51, P2: 140, P3: 303, P4: 164, P5: 0 }, total: 658, criticalPct: 7.8 },
        monitoring: { observations: 10440 },
        results: { total: 553, abnormal: 94, pending: 0, abnormalPct: 17 },
        medications: { total: 101, pending: 18, completed: 83, approved: 76, rejected: 7 },
        alerts: {
          total: 625,
          acknowledged: 420,
          pending: 138,
          escalated: 67,
          acknowledgedPct: 67.2,
          pendingPct: 22.1,
          escalatedPct: 10.7,
          unacknowledgedPct: 32.8,
        },
        dspAccessByRole: { Physician: 816, Nurse: 767, Admin: 400, Pharmacist: 318, 'Lab-Technician': 320 },
      });
      const search = jest.fn(async (_type: string, params: Record<string, unknown> = {}) =>
        params._summary === 'count' || params._summary === 'true' ? countset(0) : searchset([]),
      );

      const kpis = await makeService(search).getKpis(Role.PHYSICIAN, 'physician-without-assignments');

      expect(kpis.cohortSize).toBe(520);
      expect(kpis.pathwayMix.chronic).toBeGreaterThan(0);
      expect(kpis.results.abnormal).toBeGreaterThan(0);
      expect(kpis.alerts.pending + kpis.alerts.escalated).toBeGreaterThan(0);
      expect(kpis.monitoring.observations).toBeGreaterThan(0);
      expect(sumValues(kpis.demographics.byZone)).toBe(kpis.cohortSize);
      expect(sumValues(kpis.demographics.byRiskGroup)).toBe(kpis.cohortSize);
      expect(sumValues(kpis.triage.byPriority)).toBe(kpis.triage.total);
      expect(kpis.alerts.acknowledged + kpis.alerts.pending + kpis.alerts.escalated).toBe(kpis.alerts.total);
      expect(kpis.results.abnormal).toBeLessThanOrEqual(kpis.results.total);
      expect(loadSeedKpisMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('getKpis (seed fallback)', () => {
    const seedReport: KpiReport = {
      source: 'seed',
      generatedAt: '2026-05-30T15:40:00+00:00',
      cohortSize: 371,
      staffCount: 15,
      staffDistribution: { Physician: 5, Nurse: 5, Admin: 2, Pharmacist: 2, 'Lab-Technician': 1 },
      demographics: {
        byZone: { Rural: 100, Urban: 200, 'Peri-urban': 71 },
        byRiskGroup: { Standard: 200, 'Chronic-risk': 100, Elderly: 50, Pediatric: 21 },
      },
      pathwayMix: { chronic: 232, episodic: 299, total: 531, chronicPct: 43.7, episodicPct: 56.3 },
      triage: { byPriority: { P1: 51, P2: 140, P3: 303, P4: 164, P5: 0 }, total: 658, criticalPct: 7.8 },
      monitoring: { observations: 10440 },
      results: { total: 553, abnormal: 94, pending: 0, abnormalPct: 17 },
      medications: { total: 100, pending: 18, completed: 82, approved: 75, rejected: 7 },
      alerts: {
        total: 626,
        acknowledged: 445,
        pending: 114,
        escalated: 67,
        acknowledgedPct: 71.1,
        pendingPct: 18.2,
        escalatedPct: 10.7,
        unacknowledgedPct: 28.9,
      },
      dspAccessByRole: { Physician: 816, Nurse: 767, Admin: 400, Pharmacist: 318, 'Lab-Technician': 320 },
    };

    it('falls back to the seed report when live aggregation throws', async () => {
      loadSeedKpisMock.mockReturnValue(seedReport);
      const search = jest.fn().mockRejectedValue(new Error('HAPI unreachable'));

      const kpis = await makeService(search).getKpis(Role.ADMIN, 'admin-id');

      expect(kpis).toBe(seedReport);
      expect(loadSeedKpisMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to the seed report when HAPI has no patients', async () => {
      loadSeedKpisMock.mockReturnValue(seedReport);
      const search = jest.fn(async (_type: string, params: Record<string, unknown> = {}) =>
        params._summary === 'count' ? countset(0) : searchset([]),
      );

      const kpis = await makeService(search).getKpis(Role.ADMIN, 'admin-id');

      expect(kpis.source).toBe('seed');
      expect(loadSeedKpisMock).toHaveBeenCalledTimes(1);
    });

    it('returns a zero-filled live report when no seed file is available (recovery)', async () => {
      loadSeedKpisMock.mockReturnValue(null);
      const search = jest.fn().mockRejectedValue(new Error('HAPI unreachable'));

      const kpis = await makeService(search).getKpis(Role.ADMIN, 'admin-id');
      expect(kpis.source).toBe('live');
      expect(kpis.cohortSize).toBe(0);
    });

    it('returns a zero-filled live report when empty and no seed file exists', async () => {
      loadSeedKpisMock.mockReturnValue(null);
      const search = jest.fn(async (_type: string, params: Record<string, unknown> = {}) =>
        params._summary === 'count' ? countset(0) : searchset([]),
      );

      const kpis = await makeService(search).getKpis(Role.ADMIN, 'admin-id');

      expect(kpis.source).toBe('live');
      expect(kpis.cohortSize).toBe(0);
      expect(kpis.alerts.total).toBe(0);
    });
  });
});

describe('mapSeedKpis', () => {
  const seedJson: SeedKpis = {
    generated_at: '2026-05-30T15:40:00+00:00',
    source: 'Telehealth_Framework_Complete.xlsx',
    patients_total: 371,
    cases_total: 531,
    pathway_mix: { chronic: 232, episodic: 299 },
    monitoring_observations_total: 10440,
    service_results: { total: 553, abnormal: 94 },
    alerts: { total: 626, by_status: { Acknowledged: 445, Pending: 114, Escalated: 67 } },
    dsp_access_by_role: { Physician: 816, Nurse: 767, Admin: 400, 'Lab Technician': 320, Pharmacist: 318 },
    triage_priority_distribution: { Medium: 303, Low: 164, High: 140, Critical: 51 },
  };

  it('maps named triage buckets to the P1…P5 scale', () => {
    const { triage } = mapSeedKpis(seedJson);
    expect(triage.byPriority).toEqual({ P1: 51, P2: 140, P3: 303, P4: 164, P5: 0 });
    expect(triage.total).toBe(658);
    expect(triage.criticalPct).toBe(7.8);
  });

  it('normalises the spaced "Lab Technician" role key to the Lab-Technician code', () => {
    const { dspAccessByRole } = mapSeedKpis(seedJson);
    expect(dspAccessByRole['Lab-Technician']).toBe(320);
    expect(dspAccessByRole.Physician).toBe(816);
  });

  it('recomputes percentages that match the seeder figures', () => {
    const kpis = mapSeedKpis(seedJson);
    expect(kpis.source).toBe('seed');
    expect(kpis.staffCount).toBe(5);
    expect(kpis.medications.total).toBe(101);
    expect(kpis.pathwayMix).toMatchObject({ chronicPct: 43.7, episodicPct: 56.3 });
    expect(kpis.results.abnormalPct).toBe(17);
    expect(kpis.alerts).toMatchObject({
      acknowledgedPct: 71.1,
      pendingPct: 18.2,
      escalatedPct: 10.7,
      unacknowledgedPct: 28.9,
    });
  });
});

describe('loadSeedKpis (real docs/kpis.json)', () => {
  it('reads and maps the seeder output committed at the repo root', () => {
    const { loadSeedKpis: realLoadSeedKpis } = jest.requireActual('./kpi-fallback');
    const path = resolve(__dirname, '../../../../../docs/kpis.json');
    const kpis = realLoadSeedKpis([path]) as KpiReport | null;

    expect(kpis).not.toBeNull();
    expect(kpis?.source).toBe('seed');
    expect(kpis?.cohortSize).toBe(371);
    expect(kpis?.alerts.total).toBe(625);
  });
});

function sumValues(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}
