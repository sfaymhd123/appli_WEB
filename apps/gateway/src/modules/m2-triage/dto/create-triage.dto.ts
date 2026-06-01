import { IsIn, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { SYMPTOM_SEVERITIES, type SymptomSeverity } from '@hphii/fhir-domain';

/** Triage request: a patient + the vitals/symptoms captured at the desk (M2). */
export class CreateTriageDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  systolicBp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  diastolicBp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(400)
  heartRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2000)
  glucose?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  respiratoryRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(50)
  temperature?: number;

  @IsOptional()
  @IsIn(SYMPTOM_SEVERITIES)
  symptomSeverity?: SymptomSeverity;

  /** Optional free-text chief complaint (kept generic — no PHI required). */
  @IsOptional()
  @IsString()
  complaint?: string;

  /**
   * Stable, client-generated request id for offline-first idempotency (§8). When
   * present it is stored as an Encounter.identifier and the triage Encounter is
   * created conditionally, so an assessment queued offline and replayed on
   * reconnect upserts instead of creating a duplicate Encounter/Task/alert.
   */
  @IsOptional()
  @IsString()
  clientRequestId?: string;
}
