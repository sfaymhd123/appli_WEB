import { TriagePriority } from '@hphii/fhir-domain';
import { runTriage } from './triage-engine';

describe('runTriage', () => {
  it('flags a hypertensive crisis as P1 (critical)', () => {
    const result = runTriage({ vitals: { systolicBp: 190, diastolicBp: 125 } });
    expect(result.priority).toBe(TriagePriority.P1);
    expect(result.critical).toBe(true);
    expect(result.findings.some((f) => f.code === 'bp-hypertensive-crisis')).toBe(true);
  });

  it('returns P5 when no signal fires', () => {
    const result = runTriage({ vitals: { systolicBp: 120, diastolicBp: 80, heartRate: 72 } });
    expect(result.priority).toBe(TriagePriority.P5);
    expect(result.critical).toBe(false);
  });

  it('maps a moderate symptom to P3', () => {
    const result = runTriage({ vitals: {}, symptomSeverity: 'moderate' });
    expect(result.priority).toBe(TriagePriority.P3);
  });

  it('takes the most urgent signal across vitals and symptoms', () => {
    // Mild symptom (P4) but hypertensive crisis (P1) → P1 wins.
    const result = runTriage({ vitals: { systolicBp: 185 }, symptomSeverity: 'mild' });
    expect(result.priority).toBe(TriagePriority.P1);
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
  });

  it('escalates severe hypertension (160/100) to P2, not crisis', () => {
    const result = runTriage({ vitals: { systolicBp: 165, diastolicBp: 105 } });
    expect(result.priority).toBe(TriagePriority.P2);
  });

  it('flags respiratory distress (> 30) as P1', () => {
    const result = runTriage({ vitals: { respiratoryRate: 35 } });
    expect(result.priority).toBe(TriagePriority.P1);
    expect(result.findings.some((f) => f.code === 'rr-extreme')).toBe(true);
  });

  it('flags hyperpyrexia (> 40°C) as P1', () => {
    const result = runTriage({ vitals: { temperature: 40.5 } });
    expect(result.priority).toBe(TriagePriority.P1);
    expect(result.findings.some((f) => f.code === 'temp-extreme')).toBe(true);
  });

  it('flags high fever (> 38.5°C) as P2', () => {
    const result = runTriage({ vitals: { temperature: 39 } });
    expect(result.priority).toBe(TriagePriority.P2);
    expect(result.findings.some((f) => f.code === 'temp-high')).toBe(true);
  });
});
