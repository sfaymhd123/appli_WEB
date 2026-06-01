import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * FHIR R4 `CarePlan.activity.detail.status` value set. Kept as a const tuple so
 * both the DTO (`@IsIn`) and the engine can reuse it without inventing codes.
 */
export const CARE_PLAN_ACTIVITY_STATUSES = [
  'not-started',
  'scheduled',
  'in-progress',
  'on-hold',
  'completed',
  'cancelled',
  'stopped',
  'unknown',
  'entered-in-error',
] as const;
export type CarePlanActivityStatus = (typeof CARE_PLAN_ACTIVITY_STATUSES)[number];

/** A clinical problem the plan addresses (→ FHIR Condition + CarePlan.addresses). */
export class ConditionInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  display!: string;

  /** SNOMED CT code (optional; PoC data may be free-text only). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  system?: string;
}

/** A planned care activity (→ FHIR CarePlan.activity.detail). */
export class ActivityInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  @IsOptional()
  @IsIn(CARE_PLAN_ACTIVITY_STATUSES)
  status?: CarePlanActivityStatus;
}

/** A care-team member (→ FHIR CareTeam.participant). */
export class CareTeamMemberInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string;
}

/**
 * Open a chronic care plan (M3a): a CarePlan with linked Conditions, Goals,
 * inline activities and an optional CareTeam (ARCH.md §2).
 */
export class CreateCarePlanDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ConditionInputDto)
  conditions?: ConditionInputDto[];

  /** Free-text goal descriptions (→ one FHIR Goal each). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  goals?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ActivityInputDto)
  activities?: ActivityInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CareTeamMemberInputDto)
  careTeam?: CareTeamMemberInputDto[];
}
