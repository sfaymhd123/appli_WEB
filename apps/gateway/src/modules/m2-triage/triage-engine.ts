import {
  SymptomSeverityLabels,
  TriagePriority,
  mostUrgentPriority,
  type SymptomSeverity,
} from '@hphii/fhir-domain';

/** Vital signs accepted by the triage engine (all optional). */
export interface TriageVitals {
  /** Systolic blood pressure, mmHg. */
  systolicBp?: number;
  /** Diastolic blood pressure, mmHg. */
  diastolicBp?: number;
  /** Heart rate, bpm. */
  heartRate?: number;
  /** Capillary/blood glucose, mg/dL. */
  glucose?: number;
}

export interface TriageInput {
  vitals: TriageVitals;
  /** Clinician-reported overall symptom severity. */
  symptomSeverity?: SymptomSeverity;
}

/** One rule that contributed to the decision (kept for explainability). */
export interface TriageFinding {
  /** Machine code for the rule that fired. */
  code: string;
  /** Human-readable (French) explanation. */
  detail: string;
  priority: TriagePriority;
}

export interface TriageResult {
  /** Most-urgent priority across all findings (P5 when nothing fires). */
  priority: TriagePriority;
  findings: TriageFinding[];
  /** Convenience flag — true iff priority === P1. */
  critical: boolean;
}

/** Symptom severity → candidate priority. */
const SYMPTOM_PRIORITY: Record<SymptomSeverity, TriagePriority> = {
  critical: TriagePriority.P1,
  severe: TriagePriority.P2,
  moderate: TriagePriority.P3,
  mild: TriagePriority.P4,
};

/**
 * Algorithmic triage rule engine (CLAUDE.md §2 M2, §7 thresholds, §8 P1 rule).
 *
 * Each input signal maps to a candidate priority; the assigned priority is the
 * MOST URGENT (lowest P-number) candidate across all signals. Nothing firing
 * yields P5 (non-urgent).
 *
 * Vital-sign bands — built on the §7 alert thresholds, with crisis escalation:
 *   Blood pressure
 *     · systolic ≥ 180 or diastolic ≥ 120 → P1  (hypertensive crisis)
 *     · systolic ≥ 160 or diastolic ≥ 100 → P2  (severe hypertension)
 *     · systolic >  140 or diastolic >  90 → P3  (§7 high / moderate thresholds)
 *   Heart rate (§7: < 50 or > 120 → high)
 *     · < 40 or > 140 → P1  (extreme brady/tachycardia)
 *     · < 50 or > 120 → P2
 *   Glucose, mg/dL (§7: fasting > 126 moderate, post-prandial > 200 high)
 *     · ≥ 400 → P1  (hyperglycaemic crisis)
 *     · >  250 → P2
 *     · >  126 → P3
 *   Symptom severity (clinician-reported)
 *     · critical → P1 · severe → P2 · moderate → P3 · mild → P4
 */
export function runTriage(input: TriageInput): TriageResult {
  const findings: TriageFinding[] = [];
  const { systolicBp, diastolicBp, heartRate, glucose } = input.vitals;

  // --- Blood pressure ---
  if (isNum(systolicBp) || isNum(diastolicBp)) {
    const sys = systolicBp ?? 0;
    const dia = diastolicBp ?? 0;
    if (sys >= 180 || dia >= 120) {
      findings.push(finding('bp-hypertensive-crisis', TriagePriority.P1, 'Crise hypertensive (TA ≥ 180/120 mmHg).'));
    } else if (sys >= 160 || dia >= 100) {
      findings.push(finding('bp-severe', TriagePriority.P2, 'Hypertension sévère (TA ≥ 160/100 mmHg).'));
    } else if (sys > 140 || dia > 90) {
      findings.push(finding('bp-elevated', TriagePriority.P3, 'Tension artérielle élevée (> 140/90 mmHg).'));
    }
  }

  // --- Heart rate ---
  if (isNum(heartRate)) {
    if (heartRate < 40 || heartRate > 140) {
      findings.push(finding('hr-extreme', TriagePriority.P1, `Fréquence cardiaque extrême (${heartRate} bpm).`));
    } else if (heartRate < 50 || heartRate > 120) {
      findings.push(finding('hr-abnormal', TriagePriority.P2, `Fréquence cardiaque anormale (${heartRate} bpm).`));
    }
  }

  // --- Glucose ---
  if (isNum(glucose)) {
    if (glucose >= 400) {
      findings.push(finding('glucose-crisis', TriagePriority.P1, `Hyperglycémie critique (${glucose} mg/dL).`));
    } else if (glucose > 250) {
      findings.push(finding('glucose-high', TriagePriority.P2, `Hyperglycémie marquée (${glucose} mg/dL).`));
    } else if (glucose > 126) {
      findings.push(finding('glucose-elevated', TriagePriority.P3, `Glycémie élevée (${glucose} mg/dL).`));
    }
  }

  // --- Symptom severity ---
  if (input.symptomSeverity) {
    findings.push(
      finding(
        `symptom-${input.symptomSeverity}`,
        SYMPTOM_PRIORITY[input.symptomSeverity],
        `Symptômes rapportés : ${SymptomSeverityLabels[input.symptomSeverity].toLowerCase()}.`,
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(
      finding('no-positive-finding', TriagePriority.P5, 'Aucun signe d’alerte — orientation standard.'),
    );
  }

  const priority = mostUrgentPriority(findings.map((f) => f.priority));
  return { priority, findings, critical: priority === TriagePriority.P1 };
}

function finding(code: string, priority: TriagePriority, detail: string): TriageFinding {
  return { code, priority, detail };
}

function isNum(value: number | undefined): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}
