import { Injectable, Logger } from '@nestjs/common';
import type { AuditEvent, DetectedIssue, DiagnosticReport, Encounter, Extension, Patient } from 'fhir/r4';
import {
  AcknowledgementStatus,
  HphiiUrls,
  type Role,
  type TriagePriority,
} from '@hphii/fhir-domain';

import { FhirService, type SearchParams } from '../../core/fhir';
import type {
  AlertStats,
  DspAccessByRole,
  KpiReport,
  PatientDemographics,
  ResultStats,
  TriageStats,
} from './analytics.types';
import { loadSeedKpis } from './kpi-fallback';
import {
  buildAlertStats,
  buildDemographics,
  buildPathwayMix,
  buildResultStats,
  buildTriageStats,
  emptyRiskCounts,
  emptyRoleCounts,
  emptyTriageCounts,
  emptyZoneCounts,
} from './kpi-math';

/**
 * Page size for the tally fetches. The breakdowns below depend on HPHII custom
 * extensions (triage priority, acknowledgement status, RBAC role) which are not
 * FHIR search parameters, so we fetch a capped page and tally in-process. The
 * 371-patient PoC cohort fits comfortably within one page.
 */
const TALLY_PAGE = 1000;

/** DiagnosticReport result-interpretation valueCode meaning "abnormal" (M5). */
const ABNORMAL_INTERPRETATION = 'A';

/**
 * Analytics — balanced-scorecard KPIs. Aggregates live FHIR data via the
 * FhirService (counts use `_summary=count`; extension-based breakdowns tally a
 * capped page), and falls back to the seeder's `docs/kpis.json` when HAPI is
 * unseeded or unreachable. Read-only and non-patient-specific (no @Audit).
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly fhir: FhirService) {}

  /** Compute the KPI report from live FHIR, falling back to the seeder output. */
  async getKpis(): Promise<KpiReport> {
    try {
      const cohortSize = await this.count('Patient');
      if (cohortSize === 0) {
        this.logger.warn('HAPI has no patients — serving seed KPI fallback (docs/kpis.json).');
        return this.seedOrEmpty();
      }

      const [chronic, episodic, observations] = await Promise.all([
        this.count('CarePlan'),
        this.count('Encounter'),
        this.count('Observation'),
      ]);
      const [demographics, triage, results, alerts, dspAccessByRole] = await Promise.all([
        this.tallyDemographics(),
        this.tallyTriage(),
        this.tallyResults(),
        this.tallyAlerts(),
        this.tallyDspAccess(),
      ]);

      return {
        source: 'live',
        generatedAt: new Date().toISOString(),
        cohortSize,
        demographics,
        pathwayMix: buildPathwayMix(chronic, episodic),
        triage,
        monitoring: { observations },
        results,
        alerts,
        dspAccessByRole,
      };
    } catch (error) {
      this.logger.error(
        `Live KPI aggregation failed (${describe(error)}); serving seed fallback.`,
      );
      return this.seedOrThrow(error);
    }
  }

  /* ----- live aggregation helpers ----- */

  /** Resource count via `_summary=count` (no entries fetched). */
  private async count(resourceType: string, params: SearchParams = {}): Promise<number> {
    const bundle = await this.fhir.search(resourceType, { ...params, _summary: 'count' });
    return bundle.total ?? 0;
  }

  /** Tally zone and risk group extensions across the cohort. */
  private async tallyDemographics(): Promise<PatientDemographics> {
    const bundle = await this.fhir.search<Patient>('Patient', {
      _count: TALLY_PAGE,
    });
    const byZone = emptyZoneCounts();
    const byRiskGroup = emptyRiskCounts();
    for (const entry of bundle.entry ?? []) {
      const zone = extString(entry.resource?.extension, HphiiUrls.ZONE_TYPE);
      const risk = extString(entry.resource?.extension, HphiiUrls.RISK_GROUP);
      if (zone && zone in byZone) byZone[zone] += 1;
      if (risk && risk in byRiskGroup) byRiskGroup[risk] += 1;
    }
    return buildDemographics(byZone, byRiskGroup);
  }

  /** Tally the triage-priority extension across triaged Encounters → P1…P5. */
  private async tallyTriage(): Promise<TriageStats> {
    const bundle = await this.fhir.search<Encounter>('Encounter', {
      _count: TALLY_PAGE,
      _sort: '-date',
    });
    const byPriority = emptyTriageCounts();
    for (const entry of bundle.entry ?? []) {
      const priority = extString(entry.resource?.extension, HphiiUrls.TRIAGE_PRIORITY) as
        | TriagePriority
        | undefined;
      if (priority && priority in byPriority) byPriority[priority] += 1;
    }
    return buildTriageStats(byPriority);
  }

  /** Count DiagnosticReports and how many carry an abnormal interpretation. */
  private async tallyResults(): Promise<ResultStats> {
    const bundle = await this.fhir.search<DiagnosticReport>('DiagnosticReport', {
      _count: TALLY_PAGE,
    });
    const entries = bundle.entry ?? [];
    let abnormal = 0;
    for (const entry of entries) {
      const code = entry.resource?.extension?.find(
        (ext) => ext.url === HphiiUrls.RESULT_INTERPRETATION,
      )?.valueCode;
      if (code === ABNORMAL_INTERPRETATION) abnormal += 1;
    }
    return buildResultStats(entries.length, abnormal);
  }

  /** Tally the acknowledgement-status extension across DetectedIssue alerts. */
  private async tallyAlerts(): Promise<AlertStats> {
    const bundle = await this.fhir.search<DetectedIssue>('DetectedIssue', {
      _count: TALLY_PAGE,
      _sort: '-identified',
    });
    let acknowledged = 0;
    let pending = 0;
    let escalated = 0;
    for (const entry of bundle.entry ?? []) {
      const ack = extString(entry.resource?.extension, HphiiUrls.ACKNOWLEDGEMENT_STATUS);
      if (ack === AcknowledgementStatus.ESCALATED) escalated += 1;
      else if (ack === AcknowledgementStatus.ACKNOWLEDGED) acknowledged += 1;
      // Pending or a missing status both mean "not yet acknowledged".
      else pending += 1;
    }
    return buildAlertStats(acknowledged, pending, escalated);
  }

  /** Tally DSP accesses by RBAC role from AuditEvent agents (§8). */
  private async tallyDspAccess(): Promise<DspAccessByRole> {
    const bundle = await this.fhir.search<AuditEvent>('AuditEvent', {
      _count: TALLY_PAGE,
      _sort: '-date',
    });
    const counts = emptyRoleCounts();
    for (const entry of bundle.entry ?? []) {
      for (const agent of entry.resource?.agent ?? []) {
        const role = agent.type?.coding?.find((coding) => coding.system === HphiiUrls.RBAC_ROLES)
          ?.code as Role | undefined;
        if (role && role in counts) counts[role] += 1;
      }
    }
    return counts;
  }

  /* ----- fallback helpers ----- */

  /** Seed fallback, or an all-zero live report when no seed file exists. */
  private seedOrEmpty(): KpiReport {
    return loadSeedKpis() ?? this.emptyLiveReport();
  }

  /** Seed fallback, or rethrow the live error when no seed file exists. */
  private seedOrThrow(cause: unknown): KpiReport {
    const seed = loadSeedKpis();
    if (seed) return seed;
    throw cause;
  }

  /** A zero-filled live report (HAPI reachable but empty, no seed file). */
  private emptyLiveReport(): KpiReport {
    return {
      source: 'live',
      generatedAt: new Date().toISOString(),
      cohortSize: 0,
      demographics: buildDemographics(emptyZoneCounts(), emptyRiskCounts()),
      pathwayMix: buildPathwayMix(0, 0),
      triage: buildTriageStats(emptyTriageCounts()),
      monitoring: { observations: 0 },
      results: buildResultStats(0, 0),
      alerts: buildAlertStats(0, 0, 0),
      dspAccessByRole: emptyRoleCounts(),
    };
  }
}

/** First `valueString` or `valueCode` for the given extension URL, if present. */
function extString(extensions: Extension[] | undefined, url: string): string | undefined {
  const ext = extensions?.find((e) => e.url === url);
  return ext?.valueString ?? ext?.valueCode;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
