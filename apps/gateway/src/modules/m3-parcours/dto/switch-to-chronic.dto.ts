import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Convert an acute episode into a chronic pathway (M3b → M3a): open a CarePlan
 * that addresses the episode's Conditions, linking back to the origin Encounter.
 */
export class SwitchToChronicDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /** Initial goals for the new chronic plan (→ one FHIR Goal each). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  goals?: string[];

  /** Finish the originating Encounter as part of the switch (default true). */
  @IsOptional()
  @IsBoolean()
  closeEpisode?: boolean;
}
