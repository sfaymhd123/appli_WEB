import {
  SYMPTOM_SEVERITIES,
  SymptomSeverityLabels,
  TriageOutcomeLabels,
  TriagePriorityLabels,
  type TriagePriority,
} from '@hphii/fhir-domain';
import type { BadgeTone, SelectOption } from '../../components/ui';

/** Triage priority → Badge tone (p1..p5 are defined in the design tokens). */
export const PRIORITY_TONE: Record<TriagePriority, BadgeTone> = {
  P1: 'p1',
  P2: 'p2',
  P3: 'p3',
  P4: 'p4',
  P5: 'p5',
};

export { TriagePriorityLabels, TriageOutcomeLabels };

/** Options for the symptom-severity select. */
export const SYMPTOM_SEVERITY_OPTIONS: SelectOption[] = SYMPTOM_SEVERITIES.map((value) => ({
  value,
  label: SymptomSeverityLabels[value],
}));

/** French labels for the Encounter statuses we produce in M2. */
const STATUS_LABELS: Record<string, string> = {
  triaged: 'Trié',
  'in-progress': 'En cours',
  finished: 'Terminé',
  arrived: 'Arrivé',
  planned: 'Planifié',
  cancelled: 'Annulé',
};

export function encounterStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function outcomeLabel(outcome?: string): string | undefined {
  if (!outcome) return undefined;
  return (TriageOutcomeLabels as Record<string, string>)[outcome] ?? outcome;
}

export function defaultOutcomeLabel(priority?: TriagePriority | null): string {
  return priority === 'P4' || priority === 'P5'
    ? TriageOutcomeLabels.discharged
    : TriageOutcomeLabels['in-observation'];
}

/** Last path segment of a FHIR reference (e.g. "Patient/123" → "123"). */
export function referenceId(reference?: string): string | undefined {
  return reference?.split('/').pop();
}

/** HH:MM from an ISO instant, for compact queue display. */
export function shortTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
