import type { Patient } from 'fhir/r4';
import {
  CoverageScheme,
  HphiiUrls,
  RiskGroup,
  ZoneType,
  type CoverageScheme as CoverageSchemeType,
  type RiskGroup as RiskGroupType,
  type ZoneType as ZoneTypeType,
} from '@hphii/fhir-domain';
import type { SelectOption } from '../../components/ui';

/* ----- French display labels for the M1 value sets ----- */

export const GENDER_LABELS: Record<'male' | 'female', string> = {
  male: 'Homme',
  female: 'Femme',
};

export const ZONE_LABELS: Record<ZoneTypeType, string> = {
  [ZoneType.URBAN]: 'Urbain',
  [ZoneType.PERI_URBAN]: 'Péri-urbain',
  [ZoneType.RURAL]: 'Rural',
};

export const RISK_GROUP_LABELS: Record<RiskGroupType, string> = {
  [RiskGroup.STANDARD]: 'Standard',
  [RiskGroup.CHRONIC_RISK]: 'Risque chronique',
  [RiskGroup.ELDERLY]: 'Personne âgée',
  [RiskGroup.PEDIATRIC]: 'Pédiatrique',
};

export const COVERAGE_SCHEME_LABELS: Record<CoverageSchemeType, string> = {
  [CoverageScheme.RAMED]: 'RAMED',
  [CoverageScheme.AMO]: 'AMO',
  [CoverageScheme.PRIVATE]: 'Privé',
};

function toOptions<T extends string>(labels: Record<T, string>): SelectOption[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

export const GENDER_OPTIONS = toOptions(GENDER_LABELS);
export const ZONE_OPTIONS = toOptions(ZONE_LABELS);
export const RISK_GROUP_OPTIONS = toOptions(RISK_GROUP_LABELS);
export const COVERAGE_SCHEME_OPTIONS = toOptions(COVERAGE_SCHEME_LABELS);

/* ----- FHIR Patient field accessors ----- */

export function patientDisplayName(patient: Patient): string {
  const name = patient.name?.[0];
  if (!name) return '(sans nom)';
  const given = name.given?.join(' ') ?? '';
  const composed = [given, name.family].filter(Boolean).join(' ');
  return composed || name.text || '(sans nom)';
}

export function patientMrn(patient: Patient): string | undefined {
  const hphiiId = patient.identifier?.find(
    (id) => id.system === HphiiUrls.PATIENT_ID && isHphiiIdentifier(id.value),
  )?.value;
  return hphiiId ?? demoHphiiIdentifier(patient);
}

function demoHphiiIdentifier(patient: Patient): string | undefined {
  const stableId = patient.identifier?.[0]?.value ?? patient.id ?? patient.name?.[0]?.family;
  if (!stableId) return undefined;

  const suffix = (hashString(`${stableId}|hphii-id`) % 0xffffff)
    .toString(16)
    .padStart(6, '0')
    .toUpperCase();
  return `HPHII-${new Date().getFullYear()}-${suffix}`;
}

function isHphiiIdentifier(value: string | undefined): boolean {
  return /^HPHII-\d{4}-[A-Z0-9]{6}$/i.test(value ?? '');
}

function extensionValue(patient: Patient, url: string): string | undefined {
  return patient.extension?.find((ext) => ext.url === url)?.valueString;
}

export function patientZone(patient: Patient): string | undefined {
  return extensionValue(patient, HphiiUrls.ZONE_TYPE);
}

export function patientRiskGroup(patient: Patient): string | undefined {
  return extensionValue(patient, HphiiUrls.RISK_GROUP);
}

export function patientCoverage(patient: Patient): string | undefined {
  return extensionValue(patient, HphiiUrls.COVERAGE_SCHEME);
}

export function patientPhone(patient: Patient): string | undefined {
  return patient.telecom?.find((t) => t.system === 'phone')?.value;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
