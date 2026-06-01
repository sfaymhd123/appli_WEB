import type { Coverage, Patient } from 'fhir/r4';
import type { CoverageScheme } from '@hphii/fhir-domain';

/**
 * Result of the simulated coverage eligibility check. PoC only — this is NOT a
 * real RAMED/AMO/payer verification (ARCH.md §11: label PoC data clearly).
 */
export interface EligibilityResult {
  active: boolean;
  status: 'active' | 'inactive';
  scheme: CoverageScheme;
  /** Always true: eligibility is simulated in this prototype. */
  simulated: true;
  checkedAt: string;
}

/** POST /patients/:id/coverage response: the created Coverage + its eligibility. */
export interface CoverageResult {
  coverage: Coverage;
  eligibility: EligibilityResult;
}

/** GET /patients response: matching Patient resources (a single HAPI page). */
export interface PatientSearchResult {
  total: number;
  patients: Patient[];
}
