import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { RiskGroup, ZoneType } from '@hphii/fhir-domain';

const CURRENT_YEAR = new Date().getFullYear();

/** Identity + risk profile captured by the M1 registration screen. */
export class CreatePatientDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsIn(['male', 'female'])
  gender!: 'male' | 'female';

  @IsInt()
  @Min(1900)
  @Max(CURRENT_YEAR)
  birthYear!: number;

  @IsIn(Object.values(ZoneType))
  zoneType!: ZoneType;

  @IsIn(Object.values(RiskGroup))
  riskGroup!: RiskGroup;

  /** Optional mobile number — the SMS channel (CLAUDE.md §1). */
  @IsOptional()
  @IsString()
  phone?: string;
}
