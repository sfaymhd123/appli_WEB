import type { CarePlan, Encounter } from 'fhir/r4';
import type { CarePlanReviewStatus, PathwayType } from '@hphii/fhir-domain';

/** One planned activity, flattened from CarePlan.activity.detail. */
export interface ActivitySummary {
  description: string;
  status?: string;
}

/**
 * The "needs review" marker driven by the M4 HbA1c>7 event (CLAUDE.md §8),
 * read from the `CAREPLAN_REVIEW` complex extension.
 */
export interface CarePlanReviewInfo {
  needed: boolean;
  status?: CarePlanReviewStatus;
  reason?: string;
  requestedAt?: string;
  clearedAt?: string;
}

/** A clinical problem, flattened from a FHIR Condition. */
export interface ConditionSummary {
  id: string;
  display?: string;
  code?: string;
  clinicalStatus?: string;
  category?: string;
  recordedDate?: string;
  encounterReference?: string;
}

/** A chronic CarePlan projected for the pathway view. */
export interface CarePlanSummary {
  id: string;
  status: string;
  intent?: string;
  title?: string;
  description?: string;
  created?: string;
  review: CarePlanReviewInfo;
  goals: string[];
  activities: ActivitySummary[];
  careTeam: string[];
  conditions: ConditionSummary[];
}

/** An episodic Encounter projected for the pathway view. */
export interface EpisodeSummary {
  id: string;
  status: string;
  class?: string;
  active: boolean;
  start?: string;
  end?: string;
  reason?: string;
  conditions: ConditionSummary[];
}

/** GET /patients/{id}/pathway — the chronic/episodic bifurcation snapshot. */
export interface PathwayResult {
  patientId: string;
  classification: PathwayType;
  chronic: boolean;
  episodic: boolean;
  activeCarePlan?: CarePlanSummary;
  carePlans: CarePlanSummary[];
  activeEpisode?: EpisodeSummary;
  episodes: EpisodeSummary[];
  conditions: ConditionSummary[];
}

/** Result of creating/switching into a CarePlan: the resource + its projection. */
export interface CarePlanResult {
  carePlan: CarePlan;
  summary: CarePlanSummary;
}

/** Result of creating an episode: the Encounter + its projection. */
export interface EpisodeResult {
  encounter: Encounter;
  summary: EpisodeSummary;
}
