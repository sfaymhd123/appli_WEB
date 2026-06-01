import {
  ALL_ROLES,
  TRIAGE_PRIORITIES,
  RiskGroup,
  ZoneType,
  type Role,
  type TriagePriority,
} from '@hphii/fhir-domain';

import type {
  AlertStats,
  DspAccessByRole,
  PathwayMix,
  PatientDemographics,
  ResultStats,
  TriageStats,
} from './analytics.types';

/**
 * Pure KPI arithmetic shared by the live aggregator and the seed fallback so
 * both produce identical shapes/rounding. No FHIR or IO here — trivially unit
 * testable.
 */

/** Round to one decimal place (matches the seeder's percentage precision). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Percentage of `part` within `whole`, rounded to 1 dp; 0 when `whole` is 0. */
export function pct(part: number, whole: number): number {
  return whole > 0 ? round1((part / whole) * 100) : 0;
}

/** A P1…P5 counter initialised to zero. */
export function emptyTriageCounts(): Record<TriagePriority, number> {
  return TRIAGE_PRIORITIES.reduce(
    (acc, priority) => {
      acc[priority] = 0;
      return acc;
    },
    {} as Record<TriagePriority, number>,
  );
}

/** A per-role counter (all 5 RBAC roles) initialised to zero. */
export function emptyRoleCounts(): DspAccessByRole {
  return ALL_ROLES.reduce(
    (acc, role) => {
      acc[role] = 0;
      return acc;
    },
    {} as Record<Role, number>,
  );
}

/** A counter for all 3 HPHII zone types initialised to zero. */
export function emptyZoneCounts(): Record<string, number> {
  return Object.values(ZoneType).reduce((acc, zone) => {
    acc[zone] = 0;
    return acc;
  }, {} as Record<string, number>);
}

/** A counter for all 4 HPHII risk groups initialised to zero. */
export function emptyRiskCounts(): Record<string, number> {
  return Object.values(RiskGroup).reduce((acc, group) => {
    acc[group] = 0;
    return acc;
  }, {} as Record<string, number>);
}

export function buildDemographics(
  byZone: Record<string, number>,
  byRiskGroup: Record<string, number>,
): PatientDemographics {
  return { byZone, byRiskGroup };
}

export function buildPathwayMix(chronic: number, episodic: number): PathwayMix {
  const total = chronic + episodic;
  return {
    chronic,
    episodic,
    total,
    chronicPct: pct(chronic, total),
    episodicPct: pct(episodic, total),
  };
}

export function buildTriageStats(byPriority: Record<TriagePriority, number>): TriageStats {
  const total = TRIAGE_PRIORITIES.reduce((sum, priority) => sum + (byPriority[priority] ?? 0), 0);
  return { byPriority, total, criticalPct: pct(byPriority.P1 ?? 0, total) };
}

export function buildResultStats(total: number, abnormal: number): ResultStats {
  return { total, abnormal, abnormalPct: pct(abnormal, total) };
}

export function buildAlertStats(
  acknowledged: number,
  pending: number,
  escalated: number,
  total?: number,
): AlertStats {
  const computedTotal = total ?? acknowledged + pending + escalated;
  return {
    total: computedTotal,
    acknowledged,
    pending,
    escalated,
    acknowledgedPct: pct(acknowledged, computedTotal),
    pendingPct: pct(pending, computedTotal),
    escalatedPct: pct(escalated, computedTotal),
    unacknowledgedPct: pct(pending + escalated, computedTotal),
  };
}
