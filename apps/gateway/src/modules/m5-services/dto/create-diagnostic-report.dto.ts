import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ServiceCategory } from '@hphii/fhir-domain';

const SERVICE_CATEGORIES = [ServiceCategory.LABORATORY, ServiceCategory.IMAGING] as const;

/**
 * POST /diagnostic-reports — a Lab-Technician records a result for an ordered
 * study (ARCH.md §6: "Add biological result" — Lab-Technician only). The
 * result is LOINC-coded; an abnormal flag may be set explicitly, otherwise it is
 * derived from the §7 thresholds for a known LOINC + numeric value.
 *
 * Supply a numeric result (`value` [+ `unit`]) and/or a textual `valueText`
 * (e.g. imaging findings); at least one is required (enforced in the service).
 */
export class CreateDiagnosticReportDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  /** Optional originating ServiceRequest id (→ DiagnosticReport.basedOn). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  serviceRequestId?: string;

  /** Laboratory or imaging (→ DiagnosticReport.category coding). */
  @IsIn(SERVICE_CATEGORIES)
  category!: ServiceCategory;

  /** LOINC code of the measured analyte/study (ARCH.md §5/§7). */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  loinc!: string;

  /** Human-readable label for the LOINC code. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  display?: string;

  /** Numeric result value (→ Observation.valueQuantity.value). */
  @IsOptional()
  @IsNumber()
  value?: number;

  /** Unit for {@link value} (display + UCUM code; defaults to the §7 spec unit). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  /** Free-text result (→ Observation.valueString); used for imaging findings. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  valueText?: string;

  /**
   * Explicit abnormal flag. When omitted, the gateway derives abnormality from
   * the §7 threshold for a known LOINC + numeric value (false otherwise).
   */
  @IsOptional()
  @IsBoolean()
  abnormal?: boolean;

  /** Optional narrative conclusion (→ DiagnosticReport.conclusion). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  conclusion?: string;
}
