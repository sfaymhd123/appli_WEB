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
  { category: ServiceCategory.LABORATORY, loinc: '3094-0', display: 'Urée sanguine', unit: 'mg/dL' },
  { category: ServiceCategory.LABORATORY, loinc: '2951-2', display: 'Sodium sanguin', unit: 'mmol/L' },
  { category: ServiceCategory.LABORATORY, loinc: '2823-3', display: 'Potassium sanguin', unit: 'mmol/L' },
  { category: ServiceCategory.LABORATORY, loinc: '58410-2', display: 'Numération formule sanguine' },
  { category: ServiceCategory.LABORATORY, loinc: '24331-1', display: 'Bilan lipidique' },
  { category: ServiceCategory.LABORATORY, loinc: '1742-6', display: 'ALAT / ALT', unit: 'U/L' },
  { category: ServiceCategory.LABORATORY, loinc: '1920-8', display: 'ASAT / AST', unit: 'U/L' },
  { category: ServiceCategory.LABORATORY, loinc: '1988-5', display: 'CRP', unit: 'mg/L' },
  { category: ServiceCategory.LABORATORY, loinc: '3016-3', display: 'TSH', unit: 'mIU/L' },
  { category: ServiceCategory.LABORATORY, loinc: '24356-8', display: 'Analyse d’urines' },
  { category: ServiceCategory.LABORATORY, loinc: '14957-5', display: 'Microalbuminurie', unit: 'mg/g' },
  { category: ServiceCategory.IMAGING, loinc: '36643-5', display: 'Radiographie thoracique' },
  { category: ServiceCategory.IMAGING, loinc: '24627-2', display: 'Scanner thoracique' },
  { category: ServiceCategory.IMAGING, loinc: '24590-2', display: 'Échographie abdominale' },
  { category: ServiceCategory.IMAGING, loinc: '30704-1', display: 'Échographie rénale' },
  { category: ServiceCategory.IMAGING, loinc: '36554-4', display: 'Radiographie du bassin' },
  { category: ServiceCategory.IMAGING, loinc: '30745-4', display: 'Radiographie du genou' },
  { category: ServiceCategory.IMAGING, loinc: '24648-8', display: 'Scanner cérébral' },
  { category: ServiceCategory.IMAGING, loinc: '30630-8', display: 'IRM cérébrale' },
  { category: ServiceCategory.IMAGING, loinc: '24629-8', display: 'Scanner abdominal' },
  { category: ServiceCategory.IMAGING, loinc: '24646-2', display: 'Mammographie' },
];

export function studyByLoinc(loinc?: string): StudyPreset | undefined {
  return loinc ? COMMON_STUDIES.find((study) => study.loinc === loinc) : undefined;
}

export interface MedicationPreset {
  medication: string;
  dosages: readonly string[];
  quantity?: number;
  quantityUnit?: string;
}

export const COMMON_MEDICATIONS: readonly MedicationPreset[] = [
  {
    medication: 'Metformine 500 mg',
    dosages: ['1 comprimé matin et soir', '1 comprimé le matin', '1 comprimé trois fois par jour'],
    quantity: 60,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Amlodipine 5 mg',
    dosages: ['1 comprimé le matin', '1 comprimé le soir'],
    quantity: 30,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Losartan 50 mg',
    dosages: ['1 comprimé le matin', '1 comprimé matin et soir'],
    quantity: 30,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Atorvastatine 20 mg',
    dosages: ['1 comprimé le soir', '1 comprimé par jour'],
    quantity: 30,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Paracétamol 500 mg',
    dosages: ['1 comprimé toutes les 8 heures si douleur', '2 comprimés toutes les 8 heures si douleur'],
    quantity: 24,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Amoxicilline 1 g',
    dosages: ['1 comprimé matin et soir pendant 7 jours', '1 comprimé trois fois par jour pendant 7 jours'],
    quantity: 14,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Oméprazole 20 mg',
    dosages: ['1 gélule le matin avant repas', '1 gélule matin et soir'],
    quantity: 30,
    quantityUnit: 'gélules',
  },
  {
    medication: 'Aspirine 100 mg',
    dosages: ['1 comprimé par jour', '1 comprimé le matin'],
    quantity: 30,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Furosémide 40 mg',
    dosages: ['1 comprimé le matin', '1/2 comprimé le matin'],
    quantity: 30,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Salbutamol inhalateur',
    dosages: ['2 bouffées si gêne respiratoire', '2 bouffées jusqu’à 4 fois par jour si besoin'],
    quantity: 1,
    quantityUnit: 'inhalateur',
  },
  {
    medication: 'Cétirizine 10 mg',
    dosages: ['1 comprimé le soir', '1 comprimé par jour'],
    quantity: 15,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Ibuprofène 400 mg',
    dosages: ['1 comprimé toutes les 8 heures si douleur', '1 comprimé matin et soir après repas'],
    quantity: 20,
    quantityUnit: 'comprimés',
  },
];

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
