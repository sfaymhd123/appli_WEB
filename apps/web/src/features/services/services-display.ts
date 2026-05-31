import {
  ServiceCategory,
  ServiceCategoryLabels,
  StockStatus,
  StockStatusLabels,
} from '@hphii/fhir-domain';
import type { BadgeTone, SelectOption } from '../../components/ui';

/* ----- Stock availability (simulated PoC inventory) ----- */

export function stockLabel(status: StockStatus): string {
  return StockStatusLabels[status] ?? status;
}

export function stockTone(status: StockStatus): BadgeTone {
  switch (status) {
    case StockStatus.IN_STOCK:
      return 'success';
    case StockStatus.LOW_STOCK:
      return 'warning';
    case StockStatus.OUT_OF_STOCK:
      return 'danger';
    default:
      return 'neutral';
  }
}

/* ----- Service category (laboratory / imaging) ----- */

export function serviceCategoryLabel(category?: ServiceCategory): string {
  return category ? (ServiceCategoryLabels[category] ?? category) : '—';
}

export function serviceCategoryTone(category?: ServiceCategory): BadgeTone {
  switch (category) {
    case ServiceCategory.LABORATORY:
      return 'clinical';
    case ServiceCategory.IMAGING:
      return 'info';
    default:
      return 'neutral';
  }
}

export const SERVICE_CATEGORY_OPTIONS: SelectOption[] = (
  Object.keys(ServiceCategoryLabels) as ServiceCategory[]
).map((value) => ({ value, label: ServiceCategoryLabels[value] }));

/* ----- MedicationRequest (prescription) status ----- */

const PRESCRIPTION_STATUS_LABELS: Record<string, string> = {
  draft: 'À valider',
  active: 'Validée',
  'on-hold': 'En attente',
  cancelled: 'Rejetée',
  completed: 'Délivrée',
  stopped: 'Arrêtée',
  'entered-in-error': 'Erreur de saisie',
  unknown: 'Inconnu',
};

export function prescriptionStatusLabel(status: string): string {
  return PRESCRIPTION_STATUS_LABELS[status] ?? status;
}

export function prescriptionStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'draft':
      return 'warning';
    case 'active':
      return 'success';
    case 'completed':
      return 'clinical';
    case 'cancelled':
    case 'stopped':
    case 'entered-in-error':
      return 'danger';
    default:
      return 'neutral';
  }
}

/* ----- ServiceRequest (lab/imaging order) status ----- */

const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  active: 'À réaliser',
  'on-hold': 'En attente',
  completed: 'Terminé',
  revoked: 'Annulé',
  'entered-in-error': 'Erreur de saisie',
  unknown: 'Inconnu',
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function orderStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'active':
      return 'warning';
    case 'completed':
      return 'success';
    case 'revoked':
    case 'entered-in-error':
      return 'danger';
    default:
      return 'neutral';
  }
}

/* ----- ServiceRequest priority ----- */

const PRIORITY_LABELS: Record<string, string> = {
  routine: 'Routine',
  urgent: 'Urgent',
  asap: 'Dès que possible',
  stat: 'Immédiat',
};

export const PRIORITY_OPTIONS: SelectOption[] = (
  Object.keys(PRIORITY_LABELS) as Array<keyof typeof PRIORITY_LABELS>
).map((value) => ({ value, label: PRIORITY_LABELS[value] }));

export function priorityLabel(priority?: string): string {
  return priority ? (PRIORITY_LABELS[priority] ?? priority) : '—';
}

export function priorityTone(priority?: string): BadgeTone {
  switch (priority) {
    case 'stat':
      return 'danger';
    case 'asap':
    case 'urgent':
      return 'warning';
    default:
      return 'neutral';
  }
}

/* ----- Common study presets (quick-fill for orders; free entry stays possible) ----- */

export interface StudyPreset {
  category: ServiceCategory;
  loinc: string;
  display: string;
  /** Suggested UCUM unit for a numeric result, when applicable. */
  unit?: string;
}

export const COMMON_STUDIES: readonly StudyPreset[] = [
  { category: ServiceCategory.LABORATORY, loinc: '4548-4', display: 'HbA1c', unit: '%' },
  { category: ServiceCategory.LABORATORY, loinc: '2339-0', display: 'Glycémie à jeun', unit: 'mg/dL' },
  {
    category: ServiceCategory.LABORATORY,
    loinc: '2345-7',
    display: 'Glycémie post-prandiale',
    unit: 'mg/dL',
  },
  { category: ServiceCategory.LABORATORY, loinc: '2160-0', display: 'Créatinine sérique', unit: 'mg/dL' },
  { category: ServiceCategory.IMAGING, loinc: '36643-5', display: 'Radiographie thoracique' },
  { category: ServiceCategory.IMAGING, loinc: '24627-2', display: 'Scanner thoracique' },
  { category: ServiceCategory.IMAGING, loinc: '24590-2', display: 'Échographie abdominale' },
];

export function studyByLoinc(loinc?: string): StudyPreset | undefined {
  return loinc ? COMMON_STUDIES.find((study) => study.loinc === loinc) : undefined;
}

/* ----- References & dates ----- */

/** Extract the logical id from a `Patient/123` reference. */
export function patientIdFromReference(reference?: string): string | undefined {
  if (!reference) return undefined;
  const [, id] = reference.split('/');
  return id ?? reference;
}

export function formatDateTime(value?: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}
