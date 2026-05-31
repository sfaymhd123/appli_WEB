import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Optional body for PATCH /alerts/:alertId/(acknowledge|resolve). */
export class AlertActionDto {
  /** Free-text note (PHI-safe: do not include identifiers or vitals). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
