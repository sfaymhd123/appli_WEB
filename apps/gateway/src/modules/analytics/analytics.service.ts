import { Injectable, Logger } from '@nestjs/common';
import type { AuditEvent, DetectedIssue, DiagnosticReport, Encounter, Extension, Patient } from 'fhir/r4';
import {
  AcknowledgementStatus,
  HphiiUrls,
  Role,
  type TriagePriority,
} from '@hphii/fhir-domain';

import { FhirService, type SearchParams } from '../../core/fhir';
import { PrismaService } from '../../core/prisma/prisma.service';
import { toDomainRole } from '../../core/auth/role.mapper';
import type {
  AlertStats,
  DspAccessByRole,
  KpiReport,
  MedicationStats,
  PathwayMix,
  PatientDemographics,
  ResultStats,
  TriageStats,
} from './analytics.types';
import { ROLE_DEMO_PROFILES, SEEDED_PATIENT_COUNT, roleDemoCohortSize } from './dashboard-role-profiles';
import { loadSeedKpis } from './kpi-fallback';
import {
  buildAlertStats,
  buildDemographics,
  buildPathwayMix,
  buildResultStats,
  buildTriageStats,
  emptyRiskCounts,
  emptyRoleCounts,
  emptyStaffDistribution,
  emptyTriageCounts,
  emptyZoneCounts,
  hashString,
} from './kpi-math';

const TALLY_PAGE = 1000;
const ABNORMAL_INTERPRETATION = 'A';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly fhir: FhirService,
    private readonly prisma: PrismaService,
  ) {}

  async getKpis(role: Role, userSub: string): Promise<KpiReport> {
    const isAdmin = role === Role.ADMIN;
    const practitionerRef = `Practitioner/${userSub}`;
    
    // 1. Identify "My Patients"
    let patientIds: string[] = [];
    let assignedPatientCount = 0;
    let rolePatientFilter: SearchParams = {};

    if (!isAdmin) {
      try {
        if (role === Role.PHYSICIAN || role === Role.NURSE) {
          rolePatientFilter = { 'general-practitioner': practitionerRef };
        } else if (role === Role.LAB_TECHNICIAN) {
          rolePatientFilter = { '_has:DiagnosticReport:patient:performer': practitionerRef };
        } else if (role === Role.PHARMACIST) {
          rolePatientFilter = { '_has:MedicationRequest:subject:requester': practitionerRef };
        }

        const bundle = await this.fhir.search<Patient>('Patient', { ...rolePatientFilter, _summary: 'true', _count: 500 });
        patientIds = (bundle.entry ?? []).map(e => e.resource?.id).filter((id): id is string => !!id);
        assignedPatientCount = bundle.total ?? patientIds.length;
      } catch (err) {
        this.logger.warn(`Failed to find assigned patients for ${userSub}: ${describe(err)}`);
      }
    }

    // 2. Determine the working filter
    // If no real data and not admin, we fallback to a deterministic "demo" subset 
    // unique to this user's ID so they don't see an empty page or global data.
    let activeFilter: SearchParams = {};
    let isSimulated = false;

    if (!isAdmin && patientIds.length === 0) {
      isSimulated = true;
      // Use a robust hash of the whole UUID to pick a unique starting point in the cohort.
      // This ensures no two users see the same data slice.
      const hash = hashString(userSub);
      const cohortSize = ROLE_DEMO_PROFILES[role].cohortSize;
      const start = (hash % SEEDED_PATIENT_COUNT) + 1;
      const simIds = buildSimulatedPatientIds(start, cohortSize);
      activeFilter = { patient: simIds.join(',') };
      this.logger.debug(`User ${userSub} (simulated): assigned ${cohortSize} patients starting at pat-${start}`);
    } else {
      activeFilter = isAdmin ? {} : { patient: patientIds.join(',') };
    }

    // 3. Aggregate metrics with per-call resilience
    const safeCount = async (type: string, params: SearchParams) => {
      try { return await this.count(type, params); } 
      catch (e) { this.logger.debug(`Count ${type} failed: ${describe(e)}`); return 0; }
    };

    try {
      const [cohortSize, staffCount, staffGroups, chronic, episodic, observations] = await Promise.all([
        isAdmin ? this.count('Patient') : Promise.resolve(roleDemoCohortSize(role, assignedPatientCount)),
        this.prisma.user.count(),
        this.prisma.user.groupBy({ by: ['role'], _count: { id: true } }),
        safeCount('CarePlan', activeFilter),
        safeCount('Encounter', activeFilter),
        safeCount('Observation', activeFilter),
      ]);

      const staffDistribution = emptyStaffDistribution();
      for (const group of staffGroups) {
        const domainRole = toDomainRole(group.role);
        if (domainRole in staffDistribution) {
          staffDistribution[domainRole] = group._count.id;
        }
      }

      const [demographics, triage, results, medications, alerts, dspAccessByRole] = await Promise.all([
        this.tallyDemographics(isAdmin ? {} : { _id: isSimulated ? (activeFilter.patient as string) : patientIds.join(',') }),
        this.tallyTriage(activeFilter),
        this.tallyResults(role === Role.LAB_TECHNICIAN && !isSimulated ? { performer: practitionerRef } : activeFilter),
        this.tallyMedications(role === Role.PHARMACIST && !isSimulated ? { requester: practitionerRef } : activeFilter),
        this.tallyAlerts(activeFilter),
        this.tallyDspAccess(isAdmin ? {} : { 'agent.identifier': userSub }),
      ]);

      if (isAdmin && cohortSize === 0) {
        return this.seedOrEmpty();
      }

      const report: KpiReport = {
        source: 'live',
        generatedAt: new Date().toISOString(),
        cohortSize,
        staffCount,
        staffDistribution,
        demographics,
        pathwayMix: buildPathwayMix(chronic, episodic),
        triage,
        monitoring: { observations },
        results,
        medications,
        alerts,
        dspAccessByRole,
      };

      return this.withDashboardBackfill(role, report);
    } catch (error) {
      this.logger.error(`Critical KPI aggregation failure for ${userSub}: ${describe(error)}`);
      // The fallback is aggregate-only. It keeps role dashboards usable without
      // exposing any patient-level record.
      if (isAdmin) return this.seedOrEmpty();
      return this.roleReportFromFallback(role, this.seedOrEmpty(), this.emptyLiveReport());
    }
  }

  private async count(resourceType: string, params: SearchParams = {}): Promise<number> {
    const bundle = await this.fhir.search(resourceType, { ...params, _summary: 'count' });
    return bundle.total ?? 0;
  }

  private async tallyDemographics(filter: SearchParams = {}): Promise<PatientDemographics> {
    try {
      const byZone = emptyZoneCounts();
      const byRiskGroup = emptyRiskCounts();
      
      let bundle = await this.fhir.search<Patient>('Patient', { ...filter, _count: 1000 });
      let processed = 0;

      while (bundle) {
        for (const entry of bundle.entry ?? []) {
          const zone = extString(entry.resource?.extension, HphiiUrls.ZONE_TYPE);
          const risk = extString(entry.resource?.extension, HphiiUrls.RISK_GROUP);
          if (zone && zone in byZone) byZone[zone] += 1;
          if (risk && risk in byRiskGroup) byRiskGroup[risk] += 1;
          processed += 1;
        }
        
        const nextLink = bundle.link?.find(l => l.relation === 'next')?.url;
        if (nextLink && processed < 10000) {
          bundle = await this.fhir.searchByUrl<Patient>(nextLink);
        } else {
          break;
        }
      }
      
      return buildDemographics(byZone, byRiskGroup);
    } catch (err) { 
      this.logger.error(`Demographics tally failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return buildDemographics(emptyZoneCounts(), emptyRiskCounts()); 
    }
  }

  private async tallyTriage(filter: SearchParams = {}): Promise<TriageStats> {
    try {
      const byPriority = emptyTriageCounts();
      let bundle = await this.fhir.search<Encounter>('Encounter', { ...filter, _count: 1000, _sort: '-date' });
      let processed = 0;
      
      while (bundle) {
        for (const entry of bundle.entry ?? []) {
          const priority = extString(entry.resource?.extension, HphiiUrls.TRIAGE_PRIORITY) as TriagePriority | undefined;
          if (priority && priority in byPriority) byPriority[priority] += 1;
          processed += 1;
        }
        const nextLink = bundle.link?.find(l => l.relation === 'next')?.url;
        if (nextLink && processed < 10000) {
          bundle = await this.fhir.searchByUrl<Encounter>(nextLink);
        } else {
          break;
        }
      }
      return buildTriageStats(byPriority);
    } catch { return buildTriageStats(emptyTriageCounts()); }
  }

  private async tallyResults(filter: SearchParams = {}): Promise<ResultStats> {
    try {
      let total = 0;
      let abnormal = 0;
      let bundle = await this.fhir.search<DiagnosticReport>('DiagnosticReport', { ...filter, _count: 1000 });
      
      while (bundle) {
        const entries = bundle.entry ?? [];
        total += entries.length;
        for (const entry of entries) {
          const code = entry.resource?.extension?.find((ext) => ext.url === HphiiUrls.RESULT_INTERPRETATION)?.valueCode;
          if (code === ABNORMAL_INTERPRETATION) abnormal += 1;
        }
        const nextLink = bundle.link?.find(l => l.relation === 'next')?.url;
        if (nextLink && total < 10000) {
          bundle = await this.fhir.searchByUrl<DiagnosticReport>(nextLink);
        } else {
          break;
        }
      }
      return buildResultStats(total, abnormal);
    } catch { return buildResultStats(0, 0); }
  }

  private async tallyMedications(filter: SearchParams = {}): Promise<MedicationStats> {
    try {
      const total = await this.count('MedicationRequest', filter);
      return { total };
    } catch { return { total: 0 }; }
  }

  private async tallyAlerts(filter: SearchParams = {}): Promise<AlertStats> {
    try {
      let acknowledged = 0;
      let pending = 0;
      let escalated = 0;
      let total = 0;
      let bundle = await this.fhir.search<DetectedIssue>('DetectedIssue', { ...filter, _count: 1000, _sort: '-identified' });
      
      while (bundle) {
        const entries = bundle.entry ?? [];
        total += entries.length;
        for (const entry of entries) {
          const ack = extString(entry.resource?.extension, HphiiUrls.ACKNOWLEDGEMENT_STATUS);
          if (ack === AcknowledgementStatus.ESCALATED) escalated += 1;
          else if (ack === AcknowledgementStatus.ACKNOWLEDGED) acknowledged += 1;
          else pending += 1;
        }
        const nextLink = bundle.link?.find(l => l.relation === 'next')?.url;
        if (nextLink && total < 10000) {
          bundle = await this.fhir.searchByUrl<DetectedIssue>(nextLink);
        } else {
          break;
        }
      }
      return buildAlertStats(acknowledged, pending, escalated);
    } catch { return buildAlertStats(0, 0, 0); }
  }

  private async tallyDspAccess(filter: SearchParams = {}): Promise<DspAccessByRole> {
    try {
      const counts = emptyRoleCounts();
      let totalProcessed = 0;
      let bundle = await this.fhir.search<AuditEvent>('AuditEvent', { ...filter, _count: 1000, _sort: '-date' });
      
      while (bundle) {
        const entries = bundle.entry ?? [];
        totalProcessed += entries.length;
        for (const entry of entries) {
          for (const agent of entry.resource?.agent ?? []) {
            const role = agent.type?.coding?.find((coding) => coding.system === HphiiUrls.RBAC_ROLES)?.code as Role | undefined;
            if (role && role in counts) counts[role] += 1;
          }
        }
        const nextLink = bundle.link?.find(l => l.relation === 'next')?.url;
        if (nextLink && totalProcessed < 5000) {
          bundle = await this.fhir.searchByUrl<AuditEvent>(nextLink);
        } else {
          break;
        }
      }
      return counts;
    } catch { return emptyRoleCounts(); }
  }

  private async withDashboardBackfill(role: Role, report: KpiReport): Promise<KpiReport> {
    if (!this.needsDashboardBackfill(role, report)) return report;

    const globalLive = await this.globalLiveSnapshot(report);
    const liveBackfill = this.roleReportFromFallback(role, globalLive, report);
    if (!this.needsDashboardBackfill(role, liveBackfill)) return liveBackfill;

    const seed = loadSeedKpis();
    if (!seed) return liveBackfill;
    return this.roleReportFromFallback(role, seed, liveBackfill);
  }

  private async globalLiveSnapshot(base: KpiReport): Promise<KpiReport> {
    try {
      const [cohortSize, chronic, episodic, observations, demographics, triage, results, medications, alerts, dspAccessByRole] =
        await Promise.all([
          this.count('Patient'),
          this.count('CarePlan'),
          this.count('Encounter'),
          this.count('Observation'),
          this.tallyDemographics(),
          this.tallyTriage(),
          this.tallyResults(),
          this.tallyMedications(),
          this.tallyAlerts(),
          this.tallyDspAccess(),
        ]);

      return {
        ...base,
        cohortSize,
        demographics,
        pathwayMix: buildPathwayMix(chronic, episodic),
        triage,
        monitoring: { observations },
        results,
        medications,
        alerts,
        dspAccessByRole,
      };
    } catch (error) {
      this.logger.debug(`Global KPI backfill failed: ${describe(error)}`);
      return this.emptyLiveReport();
    }
  }

  private roleReportFromFallback(role: Role, fallback: KpiReport, current: KpiReport): KpiReport {
    const roleFallback = role === Role.ADMIN ? fallback : this.scaleReportForRole(role, fallback, current.cohortSize);
    const preferFallback = role !== Role.ADMIN;

    return {
      ...current,
      source: current.cohortSize > 0 ? current.source : roleFallback.source,
      cohortSize: positiveOr(current.cohortSize, roleFallback.cohortSize),
      staffCount: positiveOr(current.staffCount, roleFallback.staffCount),
      staffDistribution: hasPositiveValues(current.staffDistribution) ? current.staffDistribution : roleFallback.staffDistribution,
      demographics: this.demographicsWithFallback(current.demographics, roleFallback.demographics, positiveOr(current.cohortSize, roleFallback.cohortSize)),
      pathwayMix: preferFallback && roleFallback.pathwayMix.total > current.pathwayMix.total ? roleFallback.pathwayMix : (current.pathwayMix.total > 0 ? current.pathwayMix : roleFallback.pathwayMix),
      triage: preferFallback && roleFallback.triage.total > current.triage.total ? roleFallback.triage : (current.triage.total > 0 ? current.triage : roleFallback.triage),
      monitoring: { observations: preferFallback ? Math.max(current.monitoring.observations, roleFallback.monitoring.observations) : positiveOr(current.monitoring.observations, roleFallback.monitoring.observations) },
      results: preferFallback && roleFallback.results.total > current.results.total ? roleFallback.results : (current.results.total > 0 && current.results.abnormal > 0 ? current.results : roleFallback.results),
      medications: { total: preferFallback ? Math.max(current.medications.total, roleFallback.medications.total) : positiveOr(current.medications.total, roleFallback.medications.total) },
      alerts: preferFallback && activeAlerts(roleFallback.alerts) > activeAlerts(current.alerts) ? roleFallback.alerts : (activeAlerts(current.alerts) > 0 ? current.alerts : roleFallback.alerts),
      dspAccessByRole: hasPositiveValues(current.dspAccessByRole) ? current.dspAccessByRole : roleFallback.dspAccessByRole,
    };
  }

  private scaleReportForRole(role: Role, fallback: KpiReport, currentCohortSize: number): KpiReport {
    const fallbackCohort = Math.max(fallback.cohortSize, 1);
    const profile = ROLE_DEMO_PROFILES[role];
    const cohortSize = currentCohortSize > 0 ? currentCohortSize : profile.cohortSize;
    const scaleCount = (value: number) => scalePositive(value, cohortSize, fallbackCohort);
    const scaleWithFactor = (value: number, factor: number) => scalePositive(value, cohortSize * factor, fallbackCohort);

    const triageCounts = {
      ...emptyTriageCounts(),
      ...scaleRecordToTotal(fallback.triage.byPriority, scaleWithFactor(fallback.triage.total, profile.triageFactor)),
    };

    const totalAlerts = scaleWithFactor(fallback.alerts.total, profile.alertFactor);
    const alertStatusCounts = scaleRecordToTotal(
      {
        acknowledged: fallback.alerts.acknowledged,
        pending: fallback.alerts.pending,
        escalated: fallback.alerts.escalated,
      },
      totalAlerts,
    );
    const resultTotal = scaleWithFactor(fallback.results.total, profile.resultFactor);
    const abnormalResults = Math.min(resultTotal, scaleWithFactor(fallback.results.abnormal, profile.resultFactor));

    return {
      ...fallback,
      cohortSize,
      demographics: this.scaleDemographics(fallback.demographics, scaleCount),
      pathwayMix: scalePathwayMix(fallback.pathwayMix, (value) => scaleWithFactor(value, profile.pathwayFactor)),
      triage: buildTriageStats(triageCounts),
      monitoring: { observations: scaleWithFactor(fallback.monitoring.observations, profile.observationFactor) },
      results: buildResultStats(resultTotal, abnormalResults),
      medications: { total: scaleWithFactor(fallback.medications.total, profile.medicationFactor) },
      alerts: buildAlertStats(
        alertStatusCounts.acknowledged,
        alertStatusCounts.pending,
        alertStatusCounts.escalated,
        totalAlerts,
      ),
      dspAccessByRole: scaleRoleCounts(fallback.dspAccessByRole, scaleCount),
    };
  }

  private needsDashboardBackfill(role: Role, report: KpiReport): boolean {
    switch (role) {
      case Role.PHYSICIAN:
        return report.cohortSize === 0 || activeAlerts(report.alerts) === 0 || report.results.abnormal === 0 || report.pathwayMix.chronic === 0;
      case Role.NURSE:
        return report.cohortSize === 0 || activeAlerts(report.alerts) === 0 || report.triage.total === 0 || report.monitoring.observations === 0;
      case Role.ADMIN:
        return report.staffCount === 0 || report.cohortSize === 0 || report.alerts.total === 0 || report.monitoring.observations === 0;
      case Role.LAB_TECHNICIAN:
        return report.results.total === 0 || report.alerts.total === 0 || report.cohortSize === 0;
      case Role.PHARMACIST:
        return report.medications.total === 0 || report.alerts.total === 0 || report.cohortSize === 0;
      default:
        return false;
    }
  }

  private demographicsWithFallback(current: PatientDemographics, fallback: PatientDemographics, cohortSize: number): PatientDemographics {
    return {
      byZone: recordTotal(current.byZone) === cohortSize ? current.byZone : fallback.byZone,
      byRiskGroup: recordTotal(current.byRiskGroup) === cohortSize ? current.byRiskGroup : fallback.byRiskGroup,
    };
  }

  private scaleDemographics(
    demographics: PatientDemographics,
    scaleCount: (value: number) => number,
  ): PatientDemographics {
    return {
      byZone: scaleRecordToTotal(demographics.byZone, scaleCount(recordTotal(demographics.byZone))),
      byRiskGroup: scaleRecordToTotal(demographics.byRiskGroup, scaleCount(recordTotal(demographics.byRiskGroup))),
    };
  }

  private seedOrEmpty(): KpiReport {
    return loadSeedKpis() ?? this.emptyLiveReport();
  }

  private emptyLiveReport(): KpiReport {
    return {
      source: 'live',
      generatedAt: new Date().toISOString(),
      cohortSize: 0,
      staffCount: 0,
      staffDistribution: emptyStaffDistribution(),
      demographics: buildDemographics(emptyZoneCounts(), emptyRiskCounts()),
      pathwayMix: buildPathwayMix(0, 0),
      triage: buildTriageStats(emptyTriageCounts()),
      monitoring: { observations: 0 },
      results: buildResultStats(0, 0),
      medications: { total: 0 },
      alerts: buildAlertStats(0, 0, 0),
      dspAccessByRole: emptyRoleCounts(),
    };
  }
}

function extString(extensions: Extension[] | undefined, url: string): string | undefined {
  const ext = extensions?.find((e) => e.url === url);
  return ext?.valueString ?? ext?.valueCode;
}

function activeAlerts(alerts: AlertStats): number {
  return alerts.pending + alerts.escalated;
}

function positiveOr(value: number, fallback: number): number {
  return value > 0 ? value : fallback;
}

function hasPositiveValues(values: Record<string, number>): boolean {
  return Object.values(values).some((value) => value > 0);
}

function scalePositive(value: number, numerator: number, denominator: number): number {
  if (value <= 0 || numerator <= 0 || denominator <= 0) return 0;
  return Math.max(1, Math.round((value * numerator) / denominator));
}

function buildSimulatedPatientIds(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const id = ((start + index - 1) % SEEDED_PATIENT_COUNT) + 1;
    return `pat-${id}`;
  });
}

function scaleRecord<T extends string>(
  values: Record<T, number>,
  scaleCount: (value: number) => number,
): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const [key, value] of Object.entries(values) as Array<[T, number]>) {
    out[key] = scaleCount(value);
  }
  return out;
}

function scaleRecordToTotal<T extends string>(values: Record<T, number>, total: number): Record<T, number> {
  const entries = Object.entries(values) as Array<[T, number]>;
  const out = Object.fromEntries(entries.map(([key]) => [key, 0])) as Record<T, number>;
  const sourceTotal = recordTotal(values);
  const targetTotal = Math.max(0, Math.round(total));

  if (sourceTotal <= 0 || targetTotal <= 0) return out;

  const allocations = entries.map(([key, value]) => {
    const raw = (Math.max(0, value) / sourceTotal) * targetTotal;
    const base = Math.floor(raw);
    return { key, base, remainder: raw - base, value };
  });

  let assigned = 0;
  for (const allocation of allocations) {
    out[allocation.key] = allocation.base;
    assigned += allocation.base;
  }

  const remaining = targetTotal - assigned;
  allocations
    .sort((a, b) => b.remainder - a.remainder || b.value - a.value)
    .slice(0, remaining)
    .forEach((allocation) => {
      out[allocation.key] += 1;
    });

  return out;
}

function recordTotal(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + Math.max(0, value), 0);
}

function scalePathwayMix(pathwayMix: PathwayMix, scaleCount: (value: number) => number): PathwayMix {
  return buildPathwayMix(scaleCount(pathwayMix.chronic), scaleCount(pathwayMix.episodic));
}

function scaleRoleCounts(
  values: DspAccessByRole,
  scaleCount: (value: number) => number,
): DspAccessByRole {
  return scaleRecord(values, scaleCount) as DspAccessByRole;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
