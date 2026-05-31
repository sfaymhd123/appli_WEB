import type { CarePlan, Encounter } from 'fhir/r4';
import type { CarePlanReviewStatus, PathwayType } from '@hphii/fhir-domain';

/* ----- projections (mirror apps/gateway m3-parcours.types.ts) ----- */

export interface ActivitySummary {
  description: string;
  status?: string;
}

export interface CarePlanReviewInfo {
  needed: boolean;
  status?: CarePlanReviewStatus;
  reason?: string;
  requestedAt?: string;
  clearedAt?: string;
}

export interface ConditionSummary {
  id: string;
  display?: string;
  code?: string;
  clinicalStatus?: string;
  category?: string;
  recordedDate?: string;
  encounterReference?: string;
}

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

export interface CarePlanResult {
  carePlan: CarePlan;
  summary: CarePlanSummary;
}

export interface EpisodeResult {
  encounter: Encounter;
  summary: EpisodeSummary;
}

/* ----- request bodies (mirror the M3 DTOs) ----- */

export interface ConditionInput {
  display: string;
  code?: string;
  system?: string;
}

export interface ActivityInput {
  description: string;
  status?: string;
}

export interface CareTeamMemberInput {
  name: string;
  role?: string;
}

/** POST /careplans */
export interface CreateCarePlanRequest {
  patientId: string;
  title?: string;
  description?: string;
  conditions?: ConditionInput[];
  goals?: string[];
  activities?: ActivityInput[];
  careTeam?: CareTeamMemberInput[];
}

/** PUT /careplans/:carePlanId */
export interface UpdateCarePlanRequest {
  title?: string;
  description?: string;
  status?: string;
  activities?: ActivityInput[];
  addGoals?: string[];
}

/** POST /careplans/:carePlanId/close and POST /episodes/:episodeId/close */
export interface ClosePathwayRequest {
  reason?: string;
  cancelled?: boolean;
}

/** POST /episodes */
export interface CreateEpisodeRequest {
  patientId: string;
  complaint?: string;
  conditions?: ConditionInput[];
  emergency?: boolean;
}

/** POST /episodes/:episodeId/switch-to-chronic */
export interface SwitchToChronicRequest {
  title?: string;
  goals?: string[];
  closeEpisode?: boolean;
}
