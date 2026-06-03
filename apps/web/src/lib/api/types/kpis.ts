import type { Role, TriagePriority } from '@hphii/fhir-domain';

/* ----- projections (mirror apps/gateway analytics.types.ts) ----- */

/** Where the report came from: live FHIR aggregation, or the seeder fallback. */
export type KpiSource = 'live' | 'seed';

export interface PathwayMix {
  chronic: number;
  episodic: number;
  total: number;
  chronicPct: number;
  episodicPct: number;
}

export interface TriageStats {
  byPriority: Record<TriagePriority, number>;
  total: number;
  criticalPct: number;
}

export interface MonitoringStats {
  observations: number;
}

export interface ResultStats {
  total: number;
  abnormal: number;
  abnormalPct: number;
}

export interface AlertStats {
  total: number;
  acknowledged: number;
  pending: number;
  escalated: number;
  acknowledgedPct: number;
  pendingPct: number;
  escalatedPct: number;
  unacknowledgedPct: number;
}

export type DspAccessByRole = Record<Role, number>;

export interface PatientDemographics {
  byZone: Record<string, number>;
  byRiskGroup: Record<string, number>;
}

/** Distribution of staff by role. */
export type StaffDistribution = Record<Role, number>;

/** Balanced-scorecard KPI report returned by GET /kpis. */
export interface KpiReport {
  source: KpiSource;
  generatedAt: string;
  cohortSize: number;
  staffCount: number;
  staffDistribution: StaffDistribution;
  demographics: PatientDemographics;
  pathwayMix: PathwayMix;
  triage: TriageStats;
  monitoring: MonitoringStats;
  results: ResultStats;
  medications: { total: number };
  alerts: AlertStats;
  dspAccessByRole: DspAccessByRole;
}
