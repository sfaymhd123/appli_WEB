import { ALL_OBSERVATION_SPECS } from '@hphii/fhir-domain';
import type { BadgeTone, SelectOption } from '../../components/ui';

const SPEC_BY_KEY = new Map(ALL_OBSERVATION_SPECS.map((spec) => [spec.key, spec]));

/** DetectedIssue.severity → Badge tone (severity-* design tokens). */
export const SEVERITY_TONE: Record<string, BadgeTone> = {
  high: 'high',
  moderate: 'moderate',
  low: 'low',
};

/** French labels for DetectedIssue.severity. */
export const SEVERITY_LABEL: Record<string, string> = {
  high: 'Haute',
  moderate: 'Modérée',
  low: 'Basse',
};

/** acknowledgement-status (§5) → Badge tone. */
export const ACK_TONE: Record<string, BadgeTone> = {
  Pending: 'warning',
  Acknowledged: 'info',
  Escalated: 'danger',
};

/** French labels for the acknowledgement-status extension. */
export const ACK_LABEL: Record<string, string> = {
  Pending: 'En attente',
  Acknowledged: 'Acquittée',
  Escalated: 'Escaladée',
};

/** French labels for the FHIR DetectedIssue.status lifecycle (§8). */
export const STATUS_LABEL: Record<string, string> = {
  registered: 'Enregistrée',
  preliminary: 'Acquittée',
  final: 'Résolue',
};

/** Options for the metric select — every §7 observation, with its unit. */
export const METRIC_OPTIONS: SelectOption[] = ALL_OBSERVATION_SPECS.map((spec) => ({
  value: spec.key,
  label: `${spec.label} (${spec.displayUnit})`,
}));

/** Human label for a metric key, e.g. "systolic-bp" → "Systolic BP". */
export function metricLabel(metric: string): string {
  return SPEC_BY_KEY.get(metric)?.label ?? metric;
}

/** Display unit for a metric key, e.g. "systolic-bp" → "mmHg". */
export function metricUnit(metric: string): string {
  return SPEC_BY_KEY.get(metric)?.displayUnit ?? '';
}

/**
 * Stable per-metric line colour for the trend chart. Full literal hex values
 * (not Tailwind classes) so they apply directly to SVG stroke/fill.
 */
const METRIC_COLORS: Record<string, string> = {
  'systolic-bp': '#dc2626',
  'diastolic-bp': '#ea580c',
  'heart-rate': '#db2777',
  'fasting-glucose': '#2563eb',
  'postprandial-glucose': '#7c3aed',
  hba1c: '#0891b2',
  'serum-creatinine': '#059669',
};

export function metricColor(metric: string): string {
  return METRIC_COLORS[metric] ?? '#64748b';
}

export interface MetricThreshold {
  value: number;
  comparator: string;
  severity: string | null;
}

/** §7 threshold values for a metric, de-duplicated, for chart reference lines. */
export function metricThresholds(metric: string): MetricThreshold[] {
  const spec = SPEC_BY_KEY.get(metric);
  if (!spec) return [];
  const seen = new Set<number>();
  const out: MetricThreshold[] = [];
  for (const rule of spec.rules) {
    if (seen.has(rule.value)) continue;
    seen.add(rule.value);
    out.push({ value: rule.value, comparator: rule.comparator, severity: rule.severity ?? null });
  }
  return out;
}

/** Last path segment of a FHIR reference (e.g. "Patient/123" → "123"). */
export function referenceId(reference?: string): string | undefined {
  return reference?.split('/').pop();
}

/** Compact date+time from an ISO instant. */
export function shortDateTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/** Escalation deadline (epoch ms) from the alert's identified time + timer. */
export function escalationDeadline(
  identifiedDateTime?: string,
  escalationMinutes?: number,
): number | null {
  if (!identifiedDateTime || typeof escalationMinutes !== 'number') return null;
  const started = new Date(identifiedDateTime).getTime();
  if (Number.isNaN(started)) return null;
  return started + escalationMinutes * 60_000;
}

/** Format a remaining duration (ms) as "m:ss"; clamps negatives to "0:00". */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
