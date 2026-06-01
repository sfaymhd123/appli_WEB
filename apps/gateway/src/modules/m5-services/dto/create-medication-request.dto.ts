import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * POST /medication-requests — a physician orders a medication (M5 pharmacy).
 * Created as a `draft`/`order` MedicationRequest awaiting pharmacist validation
 * (ARCH.md §6: "Validate prescription" — Physician/Pharmacist).
 *
 * PoC note: medication is free-text (no validated drug dictionary). An optional
 * coding may be supplied but is not clinically validated.
 */
export class CreateMedicationRequestDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  /** Free-text medication name (PoC — not a validated drug dictionary entry). */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  medication!: string;

  /** Optional medication code (e.g. ATC/RxNorm/SNOMED); PoC, not validated. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  /** Code system for {@link code} (e.g. SNOMED CT). */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  system?: string;

  /** Free-text dosage instruction (→ MedicationRequest.dosageInstruction.text). */
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  dosageInstruction!: string;

  /** Optional dispense quantity (→ dispenseRequest.quantity.value). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity?: number;

  /** Optional unit label for {@link quantity} (e.g. "comprimé", "boîte"). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  quantityUnit?: string;

  /** Prescription priority (routine | urgent | asap | stat). */
  @IsOptional()
  @IsString()
  @IsIn(['routine', 'urgent', 'asap', 'stat'])
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
