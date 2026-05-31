import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ServiceCategory } from '@hphii/fhir-domain';

/** ServiceRequest.priority value set we accept (FHIR R4). */
export const SERVICE_REQUEST_PRIORITIES = ['routine', 'urgent', 'asap', 'stat'] as const;
export type ServiceRequestPriority = (typeof SERVICE_REQUEST_PRIORITIES)[number];

const SERVICE_CATEGORIES = [ServiceCategory.LABORATORY, ServiceCategory.IMAGING] as const;

/**
 * POST /service-requests — a physician orders a laboratory or imaging study
 * (M5). Created as an `active`/`order` ServiceRequest; a Lab-Technician later
 * fulfils it with a DiagnosticReport.
 */
export class CreateServiceRequestDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  /** Laboratory or imaging (→ ServiceRequest.category SNOMED coding). */
  @IsIn(SERVICE_CATEGORIES)
  category!: ServiceCategory;

  /** Requested study label (e.g. "HbA1c", "Radiographie thoracique"). */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  display!: string;

  /** LOINC code for the requested study (recommended for laboratory orders). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  loinc?: string;

  @IsOptional()
  @IsIn(SERVICE_REQUEST_PRIORITIES)
  priority?: ServiceRequestPriority;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
