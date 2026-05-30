import { IsIn, IsOptional, IsString } from 'class-validator';
import { CoverageScheme } from '@hphii/fhir-domain';

/** A RAMED / AMO / Private coverage to attach to a patient (CLAUDE.md §2 M1). */
export class CreateCoverageDto {
  @IsIn(Object.values(CoverageScheme))
  scheme!: CoverageScheme;

  /** Optional payer-side member id (subscriberId). */
  @IsOptional()
  @IsString()
  memberId?: string;
}
