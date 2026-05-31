import type { CodeableConcept, Coding, DetectedIssue, Extension, Observation } from 'fhir/r4';
import {
  ALL_OBSERVATION_SPECS,
  AcknowledgementStatus,
  CodeSystems,
  HphiiUrls,
  observationByLoinc,
  type ObservationSpec,
  type PatientSex,
} from '@hphii/fhir-domain';

import { ObservationHelper } from '../../core/fhir';
import type { AlertSummary, VitalsSeries, VitalsTrend } from './m4-monitoring.types';

const OBSERVATION_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/observation-category';

/** Metrics modelled as FHIR vital-signs; the rest are laboratory results. */
const VITAL_SIGN_KEYS = new Set(['systolic-bp', 'diastolic-bp', 'heart-rate']);

/** v3-ObservationInterpretation display labels for the codes we emit. */
const INTERPRETATION_DISPLAY: Record<string, string> = {
  N: 'Normal',
  H: 'High',
  HH: 'Critically high',
  L: 'Low',
  LL: 'Critically low',
};

/** Resolve a §7 spec by its metric key (e.g. "systolic-bp"). */
export function specByMetric(metric: string): ObservationSpec | undefined {
  return ALL_OBSERVATION_SPECS.find((spec) => spec.key === metric);
}

/** Observation.category coding (vital-signs vs laboratory). */
function categoryCoding(spec: ObservationSpec): Coding {
  const vital = VITAL_SIGN_KEYS.has(spec.key);
  return {
    system: OBSERVATION_CATEGORY_SYSTEM,
    code: vital ? 'vital-signs' : 'laboratory',
    display: vital ? 'Vital Signs' : 'Laboratory',
  };
}

/**
 * Map a value to a v3-ObservationInterpretation code by replaying the spec's
 * threshold rules: high-severity breaches → HH/LL, others → H/L, none → N.
 */
export function interpretationCode(spec: ObservationSpec, value: number, sex?: PatientSex): string {
  for (const rule of spec.rules) {
    if (rule.sex && rule.sex !== sex) continue;
    const breached =
      (rule.comparator === '>' && value > rule.value) ||
      (rule.comparator === '<' && value < rule.value) ||
      (rule.comparator === '>=' && value >= rule.value) ||
      (rule.comparator === '<=' && value <= rule.value);
    if (breached) {
      const high = rule.comparator === '>' || rule.comparator === '>=';
      if (rule.severity === 'high') return high ? 'HH' : 'LL';
      return high ? 'H' : 'L';
    }
  }
  return 'N';
}

/** Build a coded FHIR Observation (LOINC + UCUM + interpretation) for a reading. */
export function buildObservationResource(params: {
  spec: ObservationSpec;
  patientRef: string;
  value: number;
  effectiveDateTime: string;
  sex?: PatientSex;
}): Observation {
  const { spec, patientRef, value, effectiveDateTime, sex } = params;
  const interp = interpretationCode(spec, value, sex);
  return ObservationHelper.build({
    status: 'final',
    category: [{ coding: [categoryCoding(spec)] }],
    code: {
      coding: [{ system: CodeSystems.LOINC, code: spec.loinc, display: spec.label }],
      text: spec.label,
    },
    subject: { reference: patientRef },
    effectiveDateTime,
    valueQuantity: {
      value,
      unit: spec.displayUnit,
      system: CodeSystems.UCUM,
      code: spec.ucumCode,
    },
    interpretation: [interpretationConcept(interp)],
  });
}

function interpretationConcept(code: string): CodeableConcept {
  return {
    coding: [
      {
        system: CodeSystems.OBSERVATION_INTERPRETATION,
        code,
        display: INTERPRETATION_DISPLAY[code] ?? code,
      },
    ],
  };
}

/* ----- extension readers (pure) ----- */

export function extString(extensions: Extension[] | undefined, url: string): string | undefined {
  return extensions?.find((ext) => ext.url === url)?.valueString;
}

export function extInteger(extensions: Extension[] | undefined, url: string): number | undefined {
  return extensions?.find((ext) => ext.url === url)?.valueInteger;
}

/** Upsert a valueString extension by url (mutates the array). */
export function setExtString(extensions: Extension[], url: string, valueString: string): void {
  const next: Extension = { url, valueString };
  const idx = extensions.findIndex((ext) => ext.url === url);
  if (idx >= 0) extensions[idx] = next;
  else extensions.push(next);
}

/* ----- projections for the API/UI ----- */

/** Project a DetectedIssue into a PHI-light AlertSummary. */
export function projectAlert(issue: DetectedIssue): AlertSummary {
  const ext = issue.extension ?? [];
  return {
    id: issue.id ?? '',
    patientReference: issue.patient?.reference,
    severity: issue.severity,
    status: issue.status,
    acknowledgement:
      extString(ext, HphiiUrls.ACKNOWLEDGEMENT_STATUS) ?? AcknowledgementStatus.PENDING,
    detail: typeof issue.detail === 'string' ? issue.detail : undefined,
    identifiedDateTime: issue.identifiedDateTime,
    escalationMinutes: extInteger(ext, HphiiUrls.ESCALATION_TIMER_MINUTES),
    source: extString(ext, HphiiUrls.ALERT_SOURCE),
  };
}

/** Group a patient's Observations into per-metric time series (chronological). */
export function projectTrend(patientId: string, observations: Observation[]): VitalsTrend {
  const byLoinc = new Map<string, VitalsSeries>();

  for (const obs of observations) {
    const loinc = obs.code?.coding?.find((c) => c.system === CodeSystems.LOINC)?.code;
    if (!loinc) continue;
    const spec = observationByLoinc(loinc);
    if (!spec) continue;
    const value = obs.valueQuantity?.value;
    if (typeof value !== 'number') continue;
    const at = obs.effectiveDateTime ?? obs.issued ?? obs.meta?.lastUpdated;
    if (!at) continue;

    let series = byLoinc.get(loinc);
    if (!series) {
      series = { metric: spec.key, loinc, label: spec.label, unit: spec.displayUnit, points: [] };
      byLoinc.set(loinc, series);
    }
    series.points.push({ at, value });
  }

  for (const series of byLoinc.values()) {
    series.points.sort((a, b) => a.at.localeCompare(b.at));
  }

  // Stable display order: follow the §7 spec ordering.
  const order = ALL_OBSERVATION_SPECS.map((spec) => spec.loinc);
  const series = [...byLoinc.values()].sort(
    (a, b) => order.indexOf(a.loinc) - order.indexOf(b.loinc),
  );

  return { patientId, series };
}
