import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { ConditionInputDto } from './create-care-plan.dto';

/**
 * Open an acute episode (M3b): an Encounter plus one or more encounter-diagnosis
 * Conditions (CLAUDE.md §2). `emergency` selects the Encounter.class.
 */
export class CreateEpisodeDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  /** Optional chief complaint / reason for the encounter (kept generic — no PHI required). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  complaint?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ConditionInputDto)
  conditions?: ConditionInputDto[];

  /** Emergency (EMER) vs ambulatory (AMB) encounter class. */
  @IsOptional()
  @IsBoolean()
  emergency?: boolean;
}
