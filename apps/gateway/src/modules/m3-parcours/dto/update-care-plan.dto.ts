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

import { ActivityInputDto } from './create-care-plan.dto';

/**
 * FHIR R4 `CarePlan.status` value set the gateway accepts for an adjustment.
 * `entered-in-error`/`unknown` are intentionally excluded from the API.
 */
export const CARE_PLAN_STATUSES = [
  'draft',
  'active',
  'on-hold',
  'completed',
  'revoked',
] as const;
export type CarePlanStatus = (typeof CARE_PLAN_STATUSES)[number];

/** Adjust an existing chronic care plan (M3a): title, description, status, activities, goals. */
export class UpdateCarePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsIn(CARE_PLAN_STATUSES)
  status?: CarePlanStatus;

  /** When present, replaces the plan's activity list wholesale. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ActivityInputDto)
  activities?: ActivityInputDto[];

  /** Additional goal descriptions to create and link (→ one FHIR Goal each). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  addGoals?: string[];
}
