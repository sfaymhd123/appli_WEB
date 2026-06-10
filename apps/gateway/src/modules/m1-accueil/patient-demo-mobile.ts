import type { Patient } from 'fhir/r4';
import { HphiiUrls } from '@hphii/fhir-domain';

export function patientPhone(patient: Patient): string | undefined {
  return patient.telecom?.find((contact) => contact.system === 'phone')?.value;
}

export function withDemoMobile(patient: Patient): Patient {
  if (patientPhone(patient)) return patient;

  return {
    ...patient,
    telecom: [
      ...(patient.telecom ?? []),
      {
        system: 'phone',
        use: 'mobile',
        value: demoMobileForPatient(patient),
      },
    ],
  };
}

export function demoMobileForPatient(patient: Patient): string {
  const stableId =
    patient.identifier?.find((id) => id.system === HphiiUrls.PATIENT_ID)?.value ??
    patient.identifier?.[0]?.value ??
    patient.id ??
    patient.name?.[0]?.family ??
    'patient';
  const suffix = String(10_000_000 + (hashString(stableId) % 90_000_000)).padStart(8, '0');
  return `+2126${suffix}`;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
