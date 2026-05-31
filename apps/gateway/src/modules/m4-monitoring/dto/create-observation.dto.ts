import { IsIn, IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';
import { ALL_OBSERVATION_SPECS } from '@hphii/fhir-domain';

/** Metric keys accepted by POST /observations (CLAUDE.md §7). */
const METRIC_KEYS: string[] = ALL_OBSERVATION_SPECS.map((spec) => spec.key);

/** Channels a reading can arrive through (PoC: SMS intake, in-app, device). */
const SOURCES = ['sms', 'app', 'device'] as const;
export type ObservationSource = (typeof SOURCES)[number];

/**
 * POST /observations — submit a single measured value for a patient. The metric
 * key selects the LOINC code + UCUM unit; the value is compared to §7 thresholds.
 */
export class CreateObservationDto {
  @IsString()
  patientId!: string;

  /** One of the §7 metric keys, e.g. "systolic-bp", "fasting-glucose". */
  @IsIn(METRIC_KEYS)
  metric!: string;

  @IsNumber()
  value!: number;

  @IsOptional()
  @IsIn(SOURCES)
  source?: ObservationSource;

  /** ISO-8601 instant the reading was taken; defaults to now. */
  @IsOptional()
  @IsISO8601()
  effectiveDateTime?: string;
}
