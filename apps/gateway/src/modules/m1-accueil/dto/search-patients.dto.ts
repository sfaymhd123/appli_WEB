import { IsIn, IsOptional, IsString } from 'class-validator';
import { RiskGroup, ZoneType } from '@hphii/fhir-domain';

/** Query params for GET /patients — all optional, combined with AND. */
export class SearchPatientsDto {
  /** HPHII patient identifier (token search on the value). */
  @IsOptional()
  @IsString()
  identifier?: string;

  /** Family or given name (HAPI `name` search). */
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(Object.values(ZoneType))
  zone?: ZoneType;

  @IsOptional()
  @IsIn(Object.values(RiskGroup))
  riskGroup?: RiskGroup;
}
