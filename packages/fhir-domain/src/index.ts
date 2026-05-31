/**
 * @hphii/fhir-domain — shared domain constants for the HPHII SHR / DSP.
 *
 * Single source of truth, mirroring CLAUDE.md:
 *   §5  FHIR code systems + HPHII extension/identifier URLs + custom value sets
 *   §6  RBAC roles, action matrix, role → $everything resource filter
 *   §7  LOINC observation codes, UCUM units, alert thresholds
 *
 * Imported by both the gateway (NestJS) and the web app (Vite/React).
 * These values are referenced across the whole system — keep them constant.
 */

/* ============================================================
 * §5 — Standard FHIR terminology systems
 * ========================================================== */
export const CodeSystems = {
  LOINC: 'http://loinc.org',
  SNOMED_CT: 'http://snomed.info/sct',
  UCUM: 'http://unitsofmeasure.org',
  OBSERVATION_INTERPRETATION:
    'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
  AUDIT_EVENT_TYPE_DICOM: 'http://dicom.nema.org/resources/ontology/DCM',
} as const;

/* ============================================================
 * §5 — HPHII custom extension / identifier URLs
 * ========================================================== */
export const HphiiUrls = {
  PATIENT_ID: 'https://hphii.ma/fhir/patient-id',
  ZONE_TYPE: 'https://hphii.ma/fhir/zone-type',
  RISK_GROUP: 'https://hphii.ma/fhir/risk-group',
  COVERAGE_SCHEME: 'https://hphii.ma/fhir/coverage-scheme',
  ALERT_SOURCE: 'https://hphii.ma/fhir/alert-source',
  ACKNOWLEDGEMENT_STATUS: 'https://hphii.ma/fhir/acknowledgement-status',
  ESCALATION_TIMER_MINUTES: 'https://hphii.ma/fhir/escalation-timer-minutes',
  RBAC_ROLES: 'https://hphii.ma/fhir/rbac-roles',
  RBAC_FILTER: 'https://hphii.ma/fhir/rbac-filter',
  // M2 triage (P1..P5) — not a FHIR R4 concept, modelled as a named extension.
  TRIAGE_PRIORITY: 'https://hphii.ma/fhir/triage-priority',
  TRIAGE_OUTCOME: 'https://hphii.ma/fhir/triage-outcome',
  // M3 chronic pathway — "this CarePlan needs review" marker (set by the M4
  // HbA1c>7 event). A complex extension; sub-extensions: status/reason/requestedAt.
  CAREPLAN_REVIEW: 'https://hphii.ma/fhir/careplan-review',
} as const;

/* ============================================================
 * §5 — Custom value sets (the parenthesised options in CLAUDE.md §5)
 * ========================================================== */
export const ZoneType = {
  RURAL: 'Rural',
  URBAN: 'Urban',
  PERI_URBAN: 'Peri-urban',
} as const;
export type ZoneType = (typeof ZoneType)[keyof typeof ZoneType];

export const RiskGroup = {
  STANDARD: 'Standard',
  CHRONIC_RISK: 'Chronic-risk',
  ELDERLY: 'Elderly',
  PEDIATRIC: 'Pediatric',
} as const;
export type RiskGroup = (typeof RiskGroup)[keyof typeof RiskGroup];

export const CoverageScheme = {
  RAMED: 'RAMED',
  AMO: 'AMO',
  PRIVATE: 'Private',
} as const;
export type CoverageScheme = (typeof CoverageScheme)[keyof typeof CoverageScheme];

export const AcknowledgementStatus = {
  PENDING: 'Pending',
  ACKNOWLEDGED: 'Acknowledged',
  ESCALATED: 'Escalated',
} as const;
export type AcknowledgementStatus =
  (typeof AcknowledgementStatus)[keyof typeof AcknowledgementStatus];

/* ============================================================
 * §2/§8 — M2 Triage: 5-level priority scale + symptom severity
 * ========================================================== */
/** Algorithmic triage priority, P1 (critical) … P5 (non-urgent). */
export const TriagePriority = {
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
  P5: 'P5',
} as const;
export type TriagePriority = (typeof TriagePriority)[keyof typeof TriagePriority];

/** P1…P5 ordered from most to least urgent. */
export const TRIAGE_PRIORITIES: readonly TriagePriority[] = ['P1', 'P2', 'P3', 'P4', 'P5'];

/** French labels for the triage levels (user-facing UI). */
export const TriagePriorityLabels: Record<TriagePriority, string> = {
  P1: 'P1 — Critique',
  P2: 'P2 — Très urgent',
  P3: 'P3 — Urgent',
  P4: 'P4 — Moins urgent',
  P5: 'P5 — Non urgent',
};

/** Numeric rank (1 = most urgent) for sorting/comparison. */
export function triagePriorityRank(priority: TriagePriority): number {
  return TRIAGE_PRIORITIES.indexOf(priority) + 1;
}

/** The most urgent (lowest-ranked) priority from a non-empty list. */
export function mostUrgentPriority(priorities: readonly TriagePriority[]): TriagePriority {
  return priorities.reduce((worst, p) =>
    triagePriorityRank(p) < triagePriorityRank(worst) ? p : worst,
  );
}

/** Symptom severity reported at triage (drives the symptom branch of the engine). */
export const SymptomSeverity = {
  MILD: 'mild',
  MODERATE: 'moderate',
  SEVERE: 'severe',
  CRITICAL: 'critical',
} as const;
export type SymptomSeverity = (typeof SymptomSeverity)[keyof typeof SymptomSeverity];

export const SYMPTOM_SEVERITIES: readonly SymptomSeverity[] = [
  'mild',
  'moderate',
  'severe',
  'critical',
];

export const SymptomSeverityLabels: Record<SymptomSeverity, string> = {
  mild: 'Léger',
  moderate: 'Modéré',
  severe: 'Sévère',
  critical: 'Critique',
};

/** Triage disposition recorded when a clinician validates/overrides (PUT). */
export const TriageOutcome = {
  ADMITTED: 'admitted',
  DISCHARGED: 'discharged',
  REFERRED_EXTERNAL: 'referred-external',
  IN_OBSERVATION: 'in-observation',
} as const;
export type TriageOutcome = (typeof TriageOutcome)[keyof typeof TriageOutcome];

export const TRIAGE_OUTCOMES: readonly TriageOutcome[] = [
  'admitted',
  'discharged',
  'referred-external',
  'in-observation',
];

export const TriageOutcomeLabels: Record<TriageOutcome, string> = {
  admitted: 'Admis',
  discharged: 'Sortie',
  'referred-external': 'Transféré (établissement externe)',
  'in-observation': 'En observation',
};

/* ============================================================
 * §2 — M3 Parcours: chronic / episodic bifurcation
 * ========================================================== */
/**
 * The patient's care pathway, derived by the gateway (not a FHIR field):
 *  - `chronic`  — an active CarePlan exists (M3a),
 *  - `episodic` — an active Encounter exists without a CarePlan (M3b),
 *  - `none`     — neither.
 * A patient with both an active CarePlan and an active Encounter is reported
 * `chronic` (the longitudinal plan takes precedence for classification).
 */
export const PathwayType = {
  CHRONIC: 'chronic',
  EPISODIC: 'episodic',
  NONE: 'none',
} as const;
export type PathwayType = (typeof PathwayType)[keyof typeof PathwayType];

export const PathwayTypeLabels: Record<PathwayType, string> = {
  chronic: 'Parcours chronique',
  episodic: 'Parcours épisodique',
  none: 'Aucun parcours actif',
};

/**
 * Lifecycle of a CarePlan review request (CLAUDE.md §8 — HbA1c > 7 triggers a
 * review). Stored in the {@link HphiiUrls.CAREPLAN_REVIEW} extension; not a FHIR
 * status, so modelled as a named value set.
 */
export const CarePlanReviewStatus = {
  NEEDED: 'Needed',
  CLEARED: 'Cleared',
} as const;
export type CarePlanReviewStatus =
  (typeof CarePlanReviewStatus)[keyof typeof CarePlanReviewStatus];

/* ============================================================
 * §6 — The 5 RBAC roles (code → French label)
 * ========================================================== */
export const Role = {
  PHYSICIAN: 'Physician',
  NURSE: 'Nurse',
  ADMIN: 'Admin',
  PHARMACIST: 'Pharmacist',
  LAB_TECHNICIAN: 'Lab-Technician',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const RoleLabels: Record<Role, string> = {
  Physician: 'Médecin',
  Nurse: 'Infirmier',
  Admin: 'Administrateur',
  Pharmacist: 'Pharmacien',
  'Lab-Technician': 'Laborantin',
};

export const ALL_ROLES: readonly Role[] = Object.values(Role);

/* ============================================================
 * §6 — DSP action matrix (deny by default; only `true` is allowed)
 * ========================================================== */
export const DspAction = {
  READ_RECORD: 'read_record',
  MODIFY_CLINICAL_RECORD: 'modify_clinical_record',
  ADD_BIOLOGICAL_RESULT: 'add_biological_result',
  VALIDATE_PRESCRIPTION: 'validate_prescription',
  EXPORT_RECORD: 'export_record',
  ARCHIVE_RECORD: 'archive_record',
} as const;
export type DspAction = (typeof DspAction)[keyof typeof DspAction];

export const RBAC_ACTION_MATRIX: Record<DspAction, Record<Role, boolean>> = {
  read_record:            { Physician: true,  Nurse: true,  Admin: true,  Pharmacist: true,  'Lab-Technician': true  },
  modify_clinical_record: { Physician: true,  Nurse: true,  Admin: false, Pharmacist: false, 'Lab-Technician': false },
  add_biological_result:  { Physician: false, Nurse: false, Admin: false, Pharmacist: false, 'Lab-Technician': true  },
  validate_prescription:  { Physician: true,  Nurse: false, Admin: false, Pharmacist: true,  'Lab-Technician': false },
  export_record:          { Physician: true,  Nurse: false, Admin: true,  Pharmacist: false, 'Lab-Technician': false },
  archive_record:         { Physician: false, Nurse: false, Admin: true,  Pharmacist: false, 'Lab-Technician': false },
};

/** Returns true only if the §6 matrix explicitly allows the action for the role. */
export function canPerform(role: Role, action: DspAction): boolean {
  return RBAC_ACTION_MATRIX[action]?.[role] ?? false;
}

/* ============================================================
 * §6 — Role → $everything resource filter
 * ========================================================== */
export type FilteredResourceType =
  | 'Patient'
  | 'CarePlan'
  | 'Observation'
  | 'DetectedIssue'
  | 'DocumentReference'
  | 'DiagnosticReport'
  | 'MedicationRequest'
  | 'AuditEvent';

export const ROLE_EVERYTHING_FILTER: Record<Role, readonly FilteredResourceType[]> = {
  Physician: ['Patient', 'CarePlan', 'Observation', 'DetectedIssue', 'DocumentReference'],
  Nurse: ['Patient', 'Observation', 'DetectedIssue'],
  'Lab-Technician': ['DiagnosticReport'],
  Pharmacist: ['MedicationRequest'],
  Admin: ['Patient', 'AuditEvent'],
};

/** Resource types a role is allowed to see in a $everything Bundle. */
export function allowedResourcesForRole(role: Role): readonly FilteredResourceType[] {
  return ROLE_EVERYTHING_FILTER[role] ?? [];
}

/* ============================================================
 * §7 — Monitoring: LOINC codes, UCUM units, alert thresholds
 * ========================================================== */
/** FHIR DetectedIssue.severity value set. */
export const DetectedIssueSeverity = {
  HIGH: 'high',
  MODERATE: 'moderate',
  LOW: 'low',
} as const;
export type DetectedIssueSeverity =
  (typeof DetectedIssueSeverity)[keyof typeof DetectedIssueSeverity];

export type ThresholdComparator = '>' | '<' | '>=' | '<=';
export type PatientSex = 'male' | 'female';

export interface ThresholdRule {
  readonly comparator: ThresholdComparator;
  readonly value: number;
  /** Severity assigned when breached; null = no DetectedIssue (side-effect only). */
  readonly severity: DetectedIssueSeverity | null;
  /** When set, the rule only applies to this patient sex (serum creatinine). */
  readonly sex?: PatientSex;
  /** Non-alert side effect, e.g. HbA1c > 7 triggers a CarePlan review. */
  readonly action?: 'careplan-review';
}

export interface ObservationSpec {
  readonly key: string;
  readonly label: string;
  readonly loinc: string;
  /** Human-readable unit as written in CLAUDE.md §7. */
  readonly displayUnit: string;
  /** UCUM code (CodeSystems.UCUM) for the Quantity.code. */
  readonly ucumCode: string;
  readonly rules: readonly ThresholdRule[];
}

export const OBSERVATION_SPECS = {
  SYSTOLIC_BP: {
    key: 'systolic-bp',
    label: 'Systolic blood pressure',
    loinc: '8480-6',
    displayUnit: 'mmHg',
    ucumCode: 'mm[Hg]',
    rules: [{ comparator: '>', value: 140, severity: 'high' }],
  },
  DIASTOLIC_BP: {
    key: 'diastolic-bp',
    label: 'Diastolic blood pressure',
    loinc: '8462-4',
    displayUnit: 'mmHg',
    ucumCode: 'mm[Hg]',
    rules: [{ comparator: '>', value: 90, severity: 'moderate' }],
  },
  FASTING_GLUCOSE: {
    key: 'fasting-glucose',
    label: 'Fasting glucose',
    loinc: '2339-0',
    displayUnit: 'mg/dL',
    ucumCode: 'mg/dL',
    rules: [{ comparator: '>', value: 126, severity: 'moderate' }],
  },
  POSTPRANDIAL_GLUCOSE: {
    key: 'postprandial-glucose',
    label: 'Post-prandial glucose',
    loinc: '2345-7',
    displayUnit: 'mg/dL',
    ucumCode: 'mg/dL',
    rules: [{ comparator: '>', value: 200, severity: 'high' }],
  },
  HBA1C: {
    key: 'hba1c',
    label: 'HbA1c',
    loinc: '4548-4',
    displayUnit: '%',
    ucumCode: '%',
    // > 7 triggers a CarePlan review (no DetectedIssue) — CLAUDE.md §7/§8.
    rules: [{ comparator: '>', value: 7, severity: null, action: 'careplan-review' }],
  },
  HEART_RATE: {
    key: 'heart-rate',
    label: 'Heart rate',
    loinc: '8867-4',
    displayUnit: 'bpm',
    ucumCode: '/min',
    rules: [
      { comparator: '<', value: 50, severity: 'high' },
      { comparator: '>', value: 120, severity: 'high' },
    ],
  },
  SERUM_CREATININE: {
    key: 'serum-creatinine',
    label: 'Serum creatinine',
    loinc: '2160-0',
    displayUnit: 'mg/dL',
    ucumCode: 'mg/dL',
    // §7: "> 1.2 (M) / > 1.0 (F) → alert" — modelled here as moderate severity.
    rules: [
      { comparator: '>', value: 1.2, severity: 'moderate', sex: 'male' },
      { comparator: '>', value: 1.0, severity: 'moderate', sex: 'female' },
    ],
  },
} as const satisfies Record<string, ObservationSpec>;

export type ObservationKey = keyof typeof OBSERVATION_SPECS;
export const ALL_OBSERVATION_SPECS: readonly ObservationSpec[] =
  Object.values(OBSERVATION_SPECS);

export function observationByLoinc(loinc: string): ObservationSpec | undefined {
  return ALL_OBSERVATION_SPECS.find((spec) => spec.loinc === loinc);
}

export interface ThresholdEvaluation {
  readonly breached: boolean;
  readonly severity: DetectedIssueSeverity | null;
  readonly action?: 'careplan-review';
}

/**
 * Evaluate a measured value against a spec's threshold rules.
 * Returns the first breached rule's severity/action, else breached=false.
 * Sex-specific rules are skipped when `sex` is undefined.
 */
export function evaluateThreshold(
  spec: ObservationSpec,
  value: number,
  sex?: PatientSex,
): ThresholdEvaluation {
  for (const rule of spec.rules) {
    if (rule.sex && rule.sex !== sex) continue;
    const breached =
      (rule.comparator === '>' && value > rule.value) ||
      (rule.comparator === '<' && value < rule.value) ||
      (rule.comparator === '>=' && value >= rule.value) ||
      (rule.comparator === '<=' && value <= rule.value);
    if (breached) {
      return { breached: true, severity: rule.severity, action: rule.action };
    }
  }
  return { breached: false, severity: null };
}
