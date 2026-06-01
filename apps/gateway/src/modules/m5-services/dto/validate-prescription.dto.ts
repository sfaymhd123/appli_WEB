import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Pharmacist/physician decision on a draft prescription (ARCH.md §6). */
export const PRESCRIPTION_DECISIONS = ['approve', 'reject'] as const;
export type PrescriptionDecision = (typeof PRESCRIPTION_DECISIONS)[number];

/**
 * POST /medication-requests/:id/validate — approve (→ status `active`) or reject
 * (→ status `cancelled`) a draft MedicationRequest. Allowed for Physician and
 * Pharmacist only (§6 "Validate prescription").
 */
export class ValidatePrescriptionDto {
  @IsIn(PRESCRIPTION_DECISIONS)
  decision!: PrescriptionDecision;

  /** Optional reason (recorded as a MedicationRequest.note). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
