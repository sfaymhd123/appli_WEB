import type { Coverage, Patient } from 'fhir/r4';
import type { CoverageScheme, RiskGroup, ZoneType } from '@hphii/fhir-domain';

/** Body for POST /patients (mirrors the gateway CreatePatientDto). */
export interface CreatePatientRequest {
  firstName: string;
  lastName: string;
  gender: 'male' | 'female';
  birthDate: string;
  zoneType: ZoneType;
  riskGroup: RiskGroup;
  phone?: string;
  generalPractitioner?: string;
}

/** Body for POST /patients/:id/coverage (mirrors CreateCoverageDto). */
export interface CreateCoverageRequest {
  scheme: CoverageScheme;
  memberId?: string;
}

/** Simulated eligibility outcome (PoC — not a real payer check). */
export interface EligibilityResult {
  active: boolean;
  status: 'active' | 'inactive';
  scheme: CoverageScheme;
  simulated: true;
  checkedAt: string;
}

/** Response of POST /patients/:id/coverage. */
export interface CoverageResult {
  coverage: Coverage;
  eligibility: EligibilityResult;
}

/** Query params accepted by GET /patients. */
export interface PatientSearchFilters {
  identifier?: string;
  name?: string;
  zone?: ZoneType;
  riskGroup?: RiskGroup;
}

/** Response of GET /patients. */
export interface PatientSearchResult {
  total: number;
  patients: Patient[];
}
