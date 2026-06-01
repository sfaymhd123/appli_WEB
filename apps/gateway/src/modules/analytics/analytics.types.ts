import type { Role, TriagePriority } from '@hphii/fhir-domain';

/**
 * Where a KPI report came from:
 *  - `live`: aggregated from the HAPI FHIR repository at request time;
 *  - `seed`: the seeder's `docs/kpis.json` fallback (HAPI unseeded/unreachable).
 */
export type KpiSource = 'live' | 'seed';

/** Chronic (CarePlan) vs episodic (Encounter) pathway split. */
export interface PathwayMix {
  chronic: number;
  episodic: number;
  total: number;
  chronicPct: number;
  episodicPct: number;
}

/** Triage P1–P5 distribution with the share of critical (P1) cases. */
export interface TriageStats {
  byPriority: Record<TriagePriority, number>;
  /** Total triaged cases (sum of P1…P5). */
  total: number;
  /** % of triaged cases at P1 (critical). */
  criticalPct: number;
}

/** Monitoring volume (M4 Observation count). */
export interface MonitoringStats {
  observations: number;
}

/** Service/lab result volume and abnormal share (M5 DiagnosticReport). */
export interface ResultStats {
  total: number;
  abnormal: number;
  abnormalPct: number;
}

/** Alert lifecycle counts (M4 DetectedIssue acknowledgement-status, §8). */
export interface AlertStats {
  total: number;
  acknowledged: number;
  pending: number;
  escalated: number;
  acknowledgedPct: number;
  pendingPct: number;
  escalatedPct: number;
  /** Pending + Escalated, as a % of all alerts. */
  unacknowledgedPct: number;
}

/** DSP access counts keyed by RBAC role code (from AuditEvent agents, §8). */
export type DspAccessByRole = Record<Role, number>;

/** Distribution of patients by zone and risk group (§5 extensions). */
export interface PatientDemographics {
  byZone: Record<string, number>;
  byRiskGroup: Record<string, number>;
}

/**
 * Balanced-scorecard KPI report (ARCH.md report metrics). Computed live from
 * FHIR where possible, with the seeder's `docs/kpis.json` as a fallback.
 */
export interface KpiReport {
  source: KpiSource;
  generatedAt: string;
  /** Cohort size — total Patient resources. */
  cohortSize: number;
  demographics: PatientDemographics;
  pathwayMix: PathwayMix;
  triage: TriageStats;
  monitoring: MonitoringStats;
  results: ResultStats;
  alerts: AlertStats;
  dspAccessByRole: DspAccessByRole;
}
