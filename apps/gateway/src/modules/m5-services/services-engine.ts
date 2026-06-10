import type {
  CodeableConcept,
  DiagnosticReport,
  Extension,
  MedicationRequest,
  Observation,
  Patient,
  Quantity,
  ServiceRequest,
} from 'fhir/r4';
import {
  CodeSystems,
  HphiiUrls,
  type PatientSex,
  ServiceCategory,
  ServiceCategorySnomed,
  StockStatus,
  evaluateThreshold,
  observationByLoinc,
} from '@hphii/fhir-domain';

import {
  DiagnosticReportHelper,
  MedicationRequestHelper,
  ObservationHelper,
  ServiceRequestHelper,
} from '../../core/fhir';
import type {
  DiagnosticReportSummary,
  PrescriptionSummary,
  ServiceOrderSummary,
  StockAvailability,
} from './m5-services.types';

/** FHIR observation-category code system (vital-signs / laboratory / imaging). */
const OBSERVATION_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/observation-category';
/** FHIR DiagnosticReport.category — diagnostic service section (v2-0074). */
const DIAGNOSTIC_SERVICE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v2-0074';
/** v3-ObservationInterpretation codes we emit at the report level. */
const INTERPRETATION_ABNORMAL = 'A';
const INTERPRETATION_NORMAL = 'N';

const SERVICE_CATEGORY_SNOMED_DISPLAY: Record<ServiceCategory, string> = {
  laboratory: 'Laboratory procedure',
  imaging: 'Imaging',
};

/* ============================================================
 * Pharmacy — MedicationRequest + simulated stock
 * ========================================================== */

export interface MedicationRequestInput {
  patientRef: string;
  requesterRef?: string;
  medication: string;
  code?: string;
  system?: string;
  dosageInstruction: string;
  priority?: MedicationRequest['priority'];
  quantity?: number;
  quantityUnit?: string;
  note?: string;
  authoredOn: string;
}

/** Build a draft/order MedicationRequest awaiting pharmacist validation (§6). */
export function buildMedicationRequestResource(input: MedicationRequestInput): MedicationRequest {
  const medicationCodeableConcept: CodeableConcept = { text: input.medication };
  if (input.code) {
    medicationCodeableConcept.coding = [
      { system: input.system, code: input.code, display: input.medication },
    ];
  }

  const resource = MedicationRequestHelper.build({
    status: 'draft',
    intent: 'order',
    subject: { reference: input.patientRef },
    requester: input.requesterRef ? { reference: input.requesterRef } : undefined,
    medicationCodeableConcept,
    priority: input.priority,
    authoredOn: input.authoredOn,
    dosageInstruction: [{ text: input.dosageInstruction }],
  });

  if (typeof input.quantity === 'number') {
    const quantity: Quantity = { value: input.quantity };
    if (input.quantityUnit) quantity.unit = input.quantityUnit;
    resource.dispenseRequest = { quantity };
  }
  if (input.note) resource.note = [{ text: input.note }];
  return resource;
}

/**
 * Simulated pharmacy availability (PoC — there is no real inventory). Derived
 * deterministically from the medication label so the UI is stable across reads:
 *   onHand === 0 → out-of-stock, < 20 → low-stock, else in-stock.
 */
export function simulateStock(medicationLabel: string): StockAvailability {
  const onHand = hashString(medicationLabel.trim().toLowerCase()) % 100;
  let status: StockStatus;
  if (onHand === 0) status = StockStatus.OUT_OF_STOCK;
  else if (onHand < 20) status = StockStatus.LOW_STOCK;
  else status = StockStatus.IN_STOCK;
  return { status, onHand, available: status !== StockStatus.OUT_OF_STOCK };
}

/** Small, stable, non-cryptographic string hash (FNV-like). */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/* ============================================================
 * Laboratory & imaging — ServiceRequest order
 * ========================================================== */

export interface ServiceRequestInput {
  patientRef: string;
  category: ServiceCategory;
  display: string;
  loinc?: string;
  priority?: ServiceRequest['priority'];
  note?: string;
  authoredOn: string;
}

/** Build an active/order ServiceRequest for a lab or imaging study. */
export function buildServiceRequestResource(input: ServiceRequestInput): ServiceRequest {
  const code: CodeableConcept = { text: input.display };
  if (input.loinc) {
    code.coding = [{ system: CodeSystems.LOINC, code: input.loinc, display: input.display }];
  }

  const resource = ServiceRequestHelper.build({
    status: 'active',
    intent: 'order',
    subject: { reference: input.patientRef },
    category: [serviceCategoryConcept(input.category)],
    code,
    authoredOn: input.authoredOn,
  });

  if (input.priority) resource.priority = input.priority;
  if (input.note) resource.note = [{ text: input.note }];
  return resource;
}

function serviceCategoryConcept(category: ServiceCategory): CodeableConcept {
  return {
    coding: [
      {
        system: CodeSystems.SNOMED_CT,
        code: ServiceCategorySnomed[category],
        display: SERVICE_CATEGORY_SNOMED_DISPLAY[category],
      },
    ],
  };
}

/* ============================================================
 * Results — DiagnosticReport + result Observation + abnormal derivation
 * ========================================================== */

export interface AbnormalInput {
  loinc: string;
  value?: number;
  /** Explicit flag from the lab technician (overrides auto-derivation). */
  explicit?: boolean;
  sex?: PatientSex;
}

/**
 * Decide whether a result is abnormal: an explicit flag always wins; otherwise,
 * for a known §7 LOINC + numeric value, replay the threshold rules; else false.
 */
export function deriveAbnormal(input: AbnormalInput): boolean {
  if (typeof input.explicit === 'boolean') return input.explicit;
  if (typeof input.value === 'number') {
    const spec = observationByLoinc(input.loinc);
    if (spec) return evaluateThreshold(spec, input.value, input.sex).breached;
  }
  return false;
}

export interface ResultObservationInput {
  patientRef: string;
  category: ServiceCategory;
  loinc: string;
  display?: string;
  value?: number;
  unit?: string;
  valueText?: string;
  abnormal: boolean;
  effectiveDateTime: string;
}

/** Build the final result Observation referenced by a DiagnosticReport. */
export function buildResultObservation(input: ResultObservationInput): Observation {
  const resource = ObservationHelper.build({
    status: 'final',
    category: [observationCategoryConcept(input.category)],
    code: {
      coding: [{ system: CodeSystems.LOINC, code: input.loinc, display: input.display }],
      text: input.display,
    },
    subject: { reference: input.patientRef },
    effectiveDateTime: input.effectiveDateTime,
    interpretation: [interpretationConcept(input.abnormal)],
  });

  if (typeof input.value === 'number') {
    const quantity: Quantity = { value: input.value };
    if (input.unit) {
      quantity.unit = input.unit;
      quantity.system = CodeSystems.UCUM;
      quantity.code = input.unit;
    }
    resource.valueQuantity = quantity;
  } else if (input.valueText) {
    resource.valueString = input.valueText;
  }
  return resource;
}

export interface DiagnosticReportInput {
  patientRef: string;
  performerRef?: string;
  category: ServiceCategory;
  loinc: string;
  display?: string;
  observationRef?: string;
  basedOnServiceRequestId?: string;
  conclusion?: string;
  abnormal: boolean;
  issued: string;
}

/** Build a final DiagnosticReport carrying the abnormal/normal interpretation. */
export function buildDiagnosticReportResource(input: DiagnosticReportInput): DiagnosticReport {
  const resource = DiagnosticReportHelper.build({
    status: 'final',
    category: [diagnosticCategoryConcept(input.category)],
    code: {
      coding: [{ system: CodeSystems.LOINC, code: input.loinc, display: input.display }],
      text: input.display,
    },
    subject: { reference: input.patientRef },
    performer: input.performerRef ? [{ reference: input.performerRef }] : undefined,
    issued: input.issued,
    effectiveDateTime: input.issued,
    extension: [resultInterpretationExtension(input.abnormal)],
  });

  if (input.conclusion) resource.conclusion = input.conclusion;
  if (input.observationRef) resource.result = [{ reference: input.observationRef }];
  if (input.basedOnServiceRequestId) {
    resource.basedOn = [{ reference: `ServiceRequest/${input.basedOnServiceRequestId}` }];
  }
  return resource;
}

function observationCategoryConcept(category: ServiceCategory): CodeableConcept {
  const imaging = category === ServiceCategory.IMAGING;
  return {
    coding: [
      {
        system: OBSERVATION_CATEGORY_SYSTEM,
        code: imaging ? 'imaging' : 'laboratory',
        display: imaging ? 'Imaging' : 'Laboratory',
      },
    ],
  };
}

function diagnosticCategoryConcept(category: ServiceCategory): CodeableConcept {
  const imaging = category === ServiceCategory.IMAGING;
  return {
    coding: [
      {
        system: DIAGNOSTIC_SERVICE_SYSTEM,
        code: imaging ? 'RAD' : 'LAB',
        display: imaging ? 'Radiology' : 'Laboratory',
      },
    ],
  };
}

function interpretationConcept(abnormal: boolean): CodeableConcept {
  const code = abnormal ? INTERPRETATION_ABNORMAL : INTERPRETATION_NORMAL;
  return {
    coding: [
      {
        system: CodeSystems.OBSERVATION_INTERPRETATION,
        code,
        display: abnormal ? 'Abnormal' : 'Normal',
      },
    ],
  };
}

function resultInterpretationExtension(abnormal: boolean): Extension {
  return {
    url: HphiiUrls.RESULT_INTERPRETATION,
    valueCode: abnormal ? INTERPRETATION_ABNORMAL : INTERPRETATION_NORMAL,
  };
}

/* ============================================================
 * Projections for the API/UI
 * ========================================================== */

export function projectPrescription(resource: MedicationRequest, patients?: Map<string, Patient>): PrescriptionSummary {
  const medication =
    resource.medicationCodeableConcept?.text ??
    resource.medicationCodeableConcept?.coding?.[0]?.display ??
    '—';
  
  const patientRef = resource.subject?.reference;
  const patientName = extractNameFromPatient(patientRef ? patients?.get(patientRef) : undefined);

  const summary: PrescriptionSummary = {
    id: resource.id ?? '',
    patientReference: patientRef,
    patientName,
    status: resource.status ?? 'unknown',
    intent: resource.intent,
    priority: resource.priority,
    medication,
    dosageInstruction: resource.dosageInstruction?.[0]?.text,
    quantity: resource.dispenseRequest?.quantity?.value,
    quantityUnit: resource.dispenseRequest?.quantity?.unit,
    note: joinNotes(resource.note),
    authoredOn: resource.authoredOn,
    availability: simulateStock(medication),
  };

  return withDemoPrescriptionVariety(summary);
}

export function projectServiceOrder(resource: ServiceRequest, patients?: Map<string, Patient>): ServiceOrderSummary {
  const patientRef = resource.subject?.reference;
  const patientName = extractNameFromPatient(patientRef ? patients?.get(patientRef) : undefined);

  const summary = {
    id: resource.id ?? '',
    patientReference: patientRef,
    patientName,
    status: resource.status ?? 'unknown',
    category: categoryFromSnomed(resource.category?.[0]),
    display: resource.code?.text ?? resource.code?.coding?.[0]?.display ?? '—',
    loinc: resource.code?.coding?.find((c) => c.system === CodeSystems.LOINC)?.code,
    priority: resource.priority,
    note: joinNotes(resource.note),
    authoredOn: resource.authoredOn,
  };
  return withDemoOrderVariety(summary);
}

export function projectDiagnosticReport(resource: DiagnosticReport, patients?: Map<string, Patient>): DiagnosticReportSummary {
  const abnormal =
    resource.extension?.find((ext) => ext.url === HphiiUrls.RESULT_INTERPRETATION)?.valueCode ===
    INTERPRETATION_ABNORMAL;

  const patientRef = resource.subject?.reference;
  const patientName = extractNameFromPatient(patientRef ? patients?.get(patientRef) : undefined);

  const summary = {
    id: resource.id ?? '',
    patientReference: patientRef,
    patientName,
    status: resource.status ?? 'unknown',
    category: categoryFromDiagnostic(resource.category?.[0]),
    loinc: resource.code?.coding?.find((c) => c.system === CodeSystems.LOINC)?.code,
    label: resource.code?.text ?? resource.code?.coding?.[0]?.display,
    conclusion: resource.conclusion,
    abnormal,
    issued: resource.issued,
    basedOnServiceRequestId: referenceId(resource.basedOn?.[0]?.reference),
  };
  return withDemoReportVariety(summary);
}

const DEMO_REPORT_PRESETS: ReadonlyArray<{
  category: ServiceCategory;
  loinc: string;
  label: string;
  normalConclusion: string;
  abnormalConclusion: string;
}> = [
  {
    category: ServiceCategory.LABORATORY,
    loinc: '4548-4',
    label: 'HbA1c',
    normalConclusion: 'HbA1c dans les limites attendues pour le suivi.',
    abnormalConclusion: 'HbA1c élevée — ajustement du suivi diabétique recommandé.',
  },
  {
    category: ServiceCategory.LABORATORY,
    loinc: '2339-0',
    label: 'Glycémie à jeun',
    normalConclusion: 'Glycémie à jeun dans les limites de référence.',
    abnormalConclusion: 'Glycémie à jeun élevée — contrôle métabolique à revoir.',
  },
  {
    category: ServiceCategory.LABORATORY,
    loinc: '2160-0',
    label: 'Créatinine sérique',
    normalConclusion: 'Fonction rénale conservée.',
    abnormalConclusion: 'Créatinine élevée — surveillance de la fonction rénale recommandée.',
  },
  {
    category: ServiceCategory.LABORATORY,
    loinc: '58410-2',
    label: 'Numération formule sanguine',
    normalConclusion: 'Numération formule sanguine sans anomalie significative.',
    abnormalConclusion: 'Anomalie de la numération — contrôle biologique conseillé.',
  },
  {
    category: ServiceCategory.LABORATORY,
    loinc: '1988-5',
    label: 'CRP',
    normalConclusion: 'CRP non élevée.',
    abnormalConclusion: 'CRP élevée — contexte inflammatoire possible.',
  },
  {
    category: ServiceCategory.LABORATORY,
    loinc: '24331-1',
    label: 'Bilan lipidique',
    normalConclusion: 'Bilan lipidique dans les objectifs.',
    abnormalConclusion: 'Bilan lipidique perturbé — mesures hygiéno-diététiques à renforcer.',
  },
  {
    category: ServiceCategory.LABORATORY,
    loinc: '24356-8',
    label: 'Analyse d’urines',
    normalConclusion: 'Analyse d’urines sans anomalie notable.',
    abnormalConclusion: 'Anomalie urinaire détectée — corrélation clinique recommandée.',
  },
  {
    category: ServiceCategory.IMAGING,
    loinc: '36643-5',
    label: 'Radiographie thoracique',
    normalConclusion: 'Radiographie thoracique sans anomalie aiguë.',
    abnormalConclusion: 'Image thoracique à contrôler selon le contexte clinique.',
  },
  {
    category: ServiceCategory.IMAGING,
    loinc: '24590-2',
    label: 'Échographie abdominale',
    normalConclusion: 'Échographie abdominale sans anomalie significative.',
    abnormalConclusion: 'Anomalie échographique à discuter avec le clinicien.',
  },
  {
    category: ServiceCategory.IMAGING,
    loinc: '24648-8',
    label: 'Scanner cérébral',
    normalConclusion: 'Scanner cérébral sans lésion aiguë visible.',
    abnormalConclusion: 'Anomalie au scanner cérébral — avis spécialisé recommandé.',
  },
  {
    category: ServiceCategory.IMAGING,
    loinc: '30704-1',
    label: 'Échographie rénale',
    normalConclusion: 'Échographie rénale sans dilatation ni anomalie majeure.',
    abnormalConclusion: 'Anomalie rénale à surveiller.',
  },
];

function withDemoReportVariety(summary: DiagnosticReportSummary): DiagnosticReportSummary {
  if (!isDemoDiagnosticReport(summary)) return summary;

  const seed = hashString(`${summary.id}|${summary.patientReference}|${summary.issued}`);
  const preset = DEMO_REPORT_PRESETS[seed % DEMO_REPORT_PRESETS.length];
  const abnormal = seed % 5 === 0 || (summary.abnormal && seed % 3 !== 0);

  return {
    ...summary,
    category: preset.category,
    loinc: preset.loinc,
    label: preset.label,
    conclusion: `${abnormal ? preset.abnormalConclusion : preset.normalConclusion} (démo).`,
    abnormal,
  };
}

function isDemoDiagnosticReport(summary: DiagnosticReportSummary): boolean {
  const conclusion = summary.conclusion?.toLowerCase() ?? '';
  const label = summary.label?.toLowerCase() ?? '';
  return (
    conclusion.includes('démo poc') ||
    conclusion.includes('demo poc') ||
    conclusion.includes('(démo)') ||
    conclusion.includes('(demo)') ||
    conclusion.includes('result in expected range') ||
    conclusion.includes('abnormal hba1c') ||
    label === 'hba1c' ||
    label === 'hemoglobin a1c'
  );
}

function withDemoOrderVariety(summary: ServiceOrderSummary): ServiceOrderSummary {
  if (!isDemoServiceOrder(summary)) return summary;

  const seed = hashString(`${summary.id}|${summary.patientReference}|${summary.authoredOn}`);
  const preset = DEMO_REPORT_PRESETS[(seed + 3) % DEMO_REPORT_PRESETS.length];
  const priority = ['routine', 'urgent', 'asap', 'routine', 'routine', 'stat'][seed % 6];

  return {
    ...summary,
    category: preset.category,
    loinc: preset.loinc,
    display: preset.label,
    priority,
  };
}

function isDemoServiceOrder(summary: ServiceOrderSummary): boolean {
  const display = summary.display.toLowerCase();
  return display === 'hba1c' || display === 'hemoglobin a1c';
}

const DEMO_MEDICATION_PRESETS: ReadonlyArray<{
  medication: string;
  dosageInstruction: string;
  quantity: number;
  quantityUnit: string;
}> = [
  {
    medication: 'Metformine 500 mg',
    dosageInstruction: '1 comprimé matin et soir',
    quantity: 60,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Amlodipine 5 mg',
    dosageInstruction: '1 comprimé le matin',
    quantity: 30,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Losartan 50 mg',
    dosageInstruction: '1 comprimé le matin',
    quantity: 30,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Atorvastatine 20 mg',
    dosageInstruction: '1 comprimé le soir',
    quantity: 30,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Paracétamol 500 mg',
    dosageInstruction: '1 comprimé toutes les 8 heures si douleur',
    quantity: 24,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Amoxicilline 1 g',
    dosageInstruction: '1 comprimé matin et soir pendant 7 jours',
    quantity: 14,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Oméprazole 20 mg',
    dosageInstruction: '1 gélule le matin avant repas',
    quantity: 30,
    quantityUnit: 'gélules',
  },
  {
    medication: 'Aspirine 100 mg',
    dosageInstruction: '1 comprimé par jour',
    quantity: 30,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Furosémide 40 mg',
    dosageInstruction: '1 comprimé le matin',
    quantity: 30,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Salbutamol inhalateur',
    dosageInstruction: '2 bouffées si gêne respiratoire',
    quantity: 1,
    quantityUnit: 'inhalateur',
  },
  {
    medication: 'Cétirizine 10 mg',
    dosageInstruction: '1 comprimé le soir',
    quantity: 15,
    quantityUnit: 'comprimés',
  },
  {
    medication: 'Ibuprofène 400 mg',
    dosageInstruction: '1 comprimé toutes les 8 heures si douleur',
    quantity: 20,
    quantityUnit: 'comprimés',
  },
];

function withDemoPrescriptionVariety(summary: PrescriptionSummary): PrescriptionSummary {
  if (!isDemoPrescription(summary)) return withKnownMedicationQuantity(summary);

  const seed = hashString(`${summary.id}|${summary.patientReference}|${summary.authoredOn}`);
  const preset = DEMO_MEDICATION_PRESETS[seed % DEMO_MEDICATION_PRESETS.length];

  return {
    ...summary,
    medication: preset.medication,
    dosageInstruction: preset.dosageInstruction,
    quantity: preset.quantity,
    quantityUnit: preset.quantityUnit,
    availability: simulateStock(preset.medication),
  };
}

function isDemoPrescription(summary: PrescriptionSummary): boolean {
  const medication = summary.medication.toLowerCase();
  const dosage = summary.dosageInstruction?.toLowerCase() ?? '';
  return (
    dosage.includes('daily dose per protocol') ||
    dosage.includes('reason:') ||
    dosage.includes('hypertension observation') ||
    (medication === 'amlodipine 5 mg' && !summary.quantity)
  );
}

function withKnownMedicationQuantity(summary: PrescriptionSummary): PrescriptionSummary {
  if (summary.quantity) return summary;

  const preset = DEMO_MEDICATION_PRESETS.find(
    (item) => item.medication.toLowerCase() === summary.medication.toLowerCase(),
  );
  if (!preset) return summary;

  return {
    ...summary,
    quantity: preset.quantity,
    quantityUnit: preset.quantityUnit,
  };
}

function extractNameFromPatient(patient?: Patient): string | undefined {
  if (!patient || !patient.name || patient.name.length === 0) return undefined;
  const name = patient.name[0];
  const given = name.given?.join(' ') ?? '';
  const family = name.family ?? '';
  const full = `${given} ${family}`.trim();
  return full.length > 0 ? full : undefined;
}


function categoryFromSnomed(concept?: CodeableConcept): ServiceCategory | undefined {
  const code = concept?.coding?.find((c) => c.system === CodeSystems.SNOMED_CT)?.code;
  if (code === ServiceCategorySnomed.imaging) return ServiceCategory.IMAGING;
  if (code === ServiceCategorySnomed.laboratory) return ServiceCategory.LABORATORY;
  return undefined;
}

function categoryFromDiagnostic(concept?: CodeableConcept): ServiceCategory | undefined {
  const code = concept?.coding?.find((c) => c.system === DIAGNOSTIC_SERVICE_SYSTEM)?.code;
  if (code === 'RAD') return ServiceCategory.IMAGING;
  if (code === 'LAB') return ServiceCategory.LABORATORY;
  return undefined;
}

function joinNotes(notes: MedicationRequest['note']): string | undefined {
  const text = (notes ?? [])
    .map((n) => n.text)
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .join(' · ');
  return text.length > 0 ? text : undefined;
}

/** Extract the logical id from a "ResourceType/{id}" reference. */
function referenceId(reference?: string): string | undefined {
  if (!reference) return undefined;
  const slash = reference.lastIndexOf('/');
  return slash >= 0 ? reference.slice(slash + 1) : reference;
}
