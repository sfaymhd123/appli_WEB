import { PathwayType, PathwayTypeLabels } from '@hphii/fhir-domain';
import type { BadgeTone } from '../../components/ui';
import type { SelectOption } from '../../components/ui';

/** French label for the pathway classification. */
export function pathwayLabel(type: PathwayType): string {
  return PathwayTypeLabels[type] ?? type;
}

/** Badge tone for the classification chip. */
export function classificationTone(type: PathwayType): BadgeTone {
  switch (type) {
    case PathwayType.CHRONIC:
      return 'clinical';
    case PathwayType.EPISODIC:
      return 'warning';
    default:
      return 'neutral';
  }
}

/* ----- CarePlan.status ----- */

const CARE_PLAN_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  'on-hold': 'En pause',
  completed: 'Clôturé',
  revoked: 'Annulé',
  'entered-in-error': 'Saisi par erreur',
  unknown: 'Inconnu',
};
export function carePlanStatusLabel(status?: string): string {
  return status ? (CARE_PLAN_STATUS_LABELS[status] ?? status) : '—';
}
export function carePlanStatusTone(status?: string): BadgeTone {
  switch (status) {
    case 'active':
      return 'success';
    case 'on-hold':
      return 'warning';
    case 'revoked':
    case 'entered-in-error':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Options offered when adjusting a plan's status (mirrors the gateway DTO set). */
export const CARE_PLAN_STATUS_OPTIONS: readonly SelectOption[] = [
  { value: 'active', label: 'Actif' },
  { value: 'on-hold', label: 'En pause' },
  { value: 'completed', label: 'Clôturé' },
  { value: 'revoked', label: 'Annulé' },
  { value: 'draft', label: 'Brouillon' },
];

/* ----- Encounter.status ----- */

const ENCOUNTER_STATUS_LABELS: Record<string, string> = {
  planned: 'Planifié',
  arrived: 'Arrivé',
  triaged: 'Trié',
  'in-progress': 'En cours',
  onleave: 'En permission',
  finished: 'Terminé',
  cancelled: 'Annulé',
  'entered-in-error': 'Saisi par erreur',
  unknown: 'Inconnu',
};
export function encounterStatusLabel(status?: string): string {
  return status ? (ENCOUNTER_STATUS_LABELS[status] ?? status) : '—';
}
export function encounterStatusTone(status?: string): BadgeTone {
  switch (status) {
    case 'planned':
    case 'arrived':
    case 'triaged':
    case 'in-progress':
    case 'onleave':
      return 'info';
    case 'cancelled':
    case 'entered-in-error':
      return 'danger';
    default:
      return 'neutral';
  }
}

/* ----- CarePlan.activity.detail.status ----- */

const ACTIVITY_STATUS_LABELS: Record<string, string> = {
  'not-started': 'À débuter',
  scheduled: 'Planifiée',
  'in-progress': 'En cours',
  'on-hold': 'En pause',
  completed: 'Terminée',
  cancelled: 'Annulée',
  stopped: 'Arrêtée',
  unknown: 'Inconnu',
  'entered-in-error': 'Saisie par erreur',
};
export function activityStatusLabel(status?: string): string {
  return status ? (ACTIVITY_STATUS_LABELS[status] ?? status) : '—';
}
export function activityStatusTone(status?: string): BadgeTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'in-progress':
      return 'info';
    case 'on-hold':
      return 'warning';
    case 'cancelled':
    case 'stopped':
      return 'danger';
    default:
      return 'neutral';
  }
}

/* ----- formatting ----- */

export function shortDateTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export function shortDate(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('fr-FR', { dateStyle: 'medium' });
}

/** "Patient/123" → "123". */
export function referenceId(reference?: string): string | undefined {
  if (!reference) return undefined;
  const slash = reference.lastIndexOf('/');
  return slash >= 0 ? reference.slice(slash + 1) : reference;
}

/** Parse a comma/newline-separated free-text list into trimmed, non-empty items. */
export function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
