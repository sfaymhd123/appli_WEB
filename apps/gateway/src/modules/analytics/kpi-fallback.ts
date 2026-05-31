import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ALL_ROLES, TRIAGE_PRIORITIES, type Role, type TriagePriority } from '@hphii/fhir-domain';

import type { KpiReport } from './analytics.types';
import {
  buildAlertStats,
  buildPathwayMix,
  buildResultStats,
  buildTriageStats,
  emptyRoleCounts,
  emptyTriageCounts,
} from './kpi-math';

/**
 * Raw shape of `docs/kpis.json` as emitted by the Python seeder (snake_case).
 * Every field is optional — the loader degrades gracefully on a partial file.
 */
export interface SeedKpis {
  generated_at?: string;
  source?: string;
  patients_total?: number;
  cases_total?: number;
  pathway_mix?: { chronic?: number; episodic?: number };
  monitoring_observations_total?: number;
  service_results?: { total?: number; abnormal?: number };
  alerts?: { total?: number; by_status?: Record<string, number> };
  dsp_access_by_role?: Record<string, number>;
  triage_priority_distribution?: Record<string, number>;
}

/** Seeder's named triage buckets → the P1…P5 scale (CLAUDE.md §2). */
const TRIAGE_BUCKET_TO_PRIORITY: Record<string, TriagePriority> = {
  Critical: 'P1',
  High: 'P2',
  Medium: 'P3',
  Low: 'P4',
};

/**
 * Candidate locations for the seeder output, most specific first. The gateway
 * runs from `apps/gateway`, so the repo-root `docs/` is two levels up; an env
 * override wins (no hard-coded absolute paths — CLAUDE.md §9).
 */
function candidatePaths(): string[] {
  const candidates = [
    process.env.KPIS_FALLBACK_PATH,
    resolve(process.cwd(), 'docs/kpis.json'),
    resolve(process.cwd(), '../../docs/kpis.json'),
  ];
  return candidates.filter((path): path is string => Boolean(path));
}

/** Map a triage key (named bucket or already a P-code) to a P1…P5 priority. */
function toTriagePriority(key: string): TriagePriority | undefined {
  if ((TRIAGE_PRIORITIES as readonly string[]).includes(key)) return key as TriagePriority;
  return TRIAGE_BUCKET_TO_PRIORITY[key];
}

/** Resolve a per-role count, tolerating the seeder's spaced "Lab Technician". */
function roleCount(raw: Record<string, number>, role: Role): number {
  return raw[role] ?? raw[role.replace('-', ' ')] ?? 0;
}

/** Map the seeder's raw JSON to the canonical {@link KpiReport} (source `seed`). */
export function mapSeedKpis(raw: SeedKpis): KpiReport {
  const byPriority = emptyTriageCounts();
  for (const [key, value] of Object.entries(raw.triage_priority_distribution ?? {})) {
    const priority = toTriagePriority(key);
    if (priority) byPriority[priority] += value ?? 0;
  }

  const byStatus = raw.alerts?.by_status ?? {};
  const acknowledged = byStatus.Acknowledged ?? 0;
  const pending = byStatus.Pending ?? 0;
  const escalated = byStatus.Escalated ?? 0;

  const dspAccessByRole = emptyRoleCounts();
  for (const role of ALL_ROLES) {
    dspAccessByRole[role] = roleCount(raw.dsp_access_by_role ?? {}, role);
  }

  return {
    source: 'seed',
    generatedAt: raw.generated_at ?? new Date().toISOString(),
    cohortSize: raw.patients_total ?? 0,
    pathwayMix: buildPathwayMix(raw.pathway_mix?.chronic ?? 0, raw.pathway_mix?.episodic ?? 0),
    triage: buildTriageStats(byPriority),
    monitoring: { observations: raw.monitoring_observations_total ?? 0 },
    results: buildResultStats(raw.service_results?.total ?? 0, raw.service_results?.abnormal ?? 0),
    alerts: buildAlertStats(acknowledged, pending, escalated, raw.alerts?.total),
    dspAccessByRole,
  };
}

/**
 * Load the seeder's KPI fallback from the first readable candidate path.
 * Returns `null` when no file is found or it cannot be parsed (the caller then
 * decides whether to surface an empty report or rethrow the live error).
 */
export function loadSeedKpis(candidates: string[] = candidatePaths()): KpiReport | null {
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const raw = JSON.parse(readFileSync(path, 'utf8')) as SeedKpis;
      return mapSeedKpis(raw);
    } catch {
      // Unreadable/invalid candidate — try the next one.
    }
  }
  return null;
}
