import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  TRIAGE_OUTCOMES,
  TRIAGE_PRIORITIES,
  type TriageOutcome,
  type TriagePriority,
} from '@hphii/fhir-domain';

/** Clinician validation/override of a triage decision (PUT /triage/:encounterId). */
export class UpdateTriageDto {
  /** Override the computed priority (P1..P5). */
  @IsOptional()
  @IsIn(TRIAGE_PRIORITIES)
  priority?: TriagePriority;

  /** Record a disposition (e.g. refer to an external facility). */
  @IsOptional()
  @IsIn(TRIAGE_OUTCOMES)
  outcome?: TriageOutcome;

  /** Destination facility name when outcome = referred-external. */
  @IsOptional()
  @IsString()
  referralFacility?: string;
}
