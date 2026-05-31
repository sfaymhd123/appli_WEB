import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Close (or cancel) a pathway. Shared by close-careplan and close-episode.
 * - CarePlan: `cancelled` → status `revoked`, otherwise `completed`.
 * - Encounter: `cancelled` → status `cancelled`, otherwise `finished`.
 */
export class ClosePathwayDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Cancel rather than complete (revoked/cancelled instead of completed/finished). */
  @IsOptional()
  @IsBoolean()
  cancelled?: boolean;
}
