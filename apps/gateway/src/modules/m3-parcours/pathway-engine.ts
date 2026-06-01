import type {
  CarePlan,
  CareTeam,
  Condition,
  Encounter,
  Extension,
  Flag,
  Goal,
  Reference,
} from 'fhir/r4';
import { CarePlanReviewStatus, CodeSystems, HphiiUrls, PathwayType } from '@hphii/fhir-domain';

import {
  CarePlanHelper,
  CareTeamHelper,
  ConditionHelper,
  GoalHelper,
} from '../../core/fhir';
import type { ActivityInputDto, ConditionInputDto } from './dto/create-care-plan.dto';
import type {
  ActivitySummary,
  CarePlanReviewInfo,
  CarePlanSummary,
  ConditionSummary,
  EpisodeSummary,
} from './m3-parcours.types';

/* ----- FHIR code systems (R4 terminology.hl7.org) ----- */
const CONDITION_CLINICAL_SYSTEM = 'http://terminology.hl7.org/CodeSystem/condition-clinical';
const CONDITION_VER_STATUS_SYSTEM = 'http://terminology.hl7.org/CodeSystem/condition-ver-status';
const CONDITION_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/condition-category';
const FLAG_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/flag-category';
const ACT_CODE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

/** Condition.category code distinguishing a chronic problem from an episode diagnosis. */
export type ConditionCategory = 'problem-list-item' | 'encounter-diagnosis';

/** The Flag.code used to surface a pending CarePlan review on the patient (idempotency key). */
export const REVIEW_FLAG_CODE = 'careplan-review-needed';

/** CarePlan statuses we treat as "active" for pathway classification. */
export function isActiveCarePlanStatus(status: string | undefined): boolean {
  return status === 'active';
}

/** Encounter statuses we treat as an "open" episode (ARCH.md §2 episodic pathway). */
export function isActiveEncounterStatus(status: string | undefined): boolean {
  return (
    status === 'planned' ||
    status === 'arrived' ||
    status === 'triaged' ||
    status === 'in-progress' ||
    status === 'onleave'
  );
}

/** chronic wins over episodic; none when neither is active (ARCH.md §2). */
export function classifyPathway(chronic: boolean, episodic: boolean): PathwayType {
  if (chronic) return PathwayType.CHRONIC;
  if (episodic) return PathwayType.EPISODIC;
  return PathwayType.NONE;
}

/** "Patient/123" → "123" (returns the input unchanged when it has no slash). */
export function refId(reference: string | undefined): string | undefined {
  if (!reference) return undefined;
  const slash = reference.lastIndexOf('/');
  return slash >= 0 ? reference.slice(slash + 1) : reference;
}

/* ============================================================
 * Builders (pure — produce resources for FhirService.create)
 * ============================================================ */

/** Build a Condition (problem-list-item for chronic, encounter-diagnosis for episodic). */
export function buildCondition(
  input: ConditionInputDto,
  patientRef: string,
  opts: { category: ConditionCategory; encounterRef?: string },
): Condition {
  return ConditionHelper.build({
    clinicalStatus: {
      coding: [{ system: CONDITION_CLINICAL_SYSTEM, code: 'active' }],
    },
    verificationStatus: {
      coding: [{ system: CONDITION_VER_STATUS_SYSTEM, code: 'confirmed' }],
    },
    category: [{ coding: [{ system: CONDITION_CATEGORY_SYSTEM, code: opts.category }] }],
    code: input.code
      ? {
          coding: [
            {
              system: input.system ?? CodeSystems.SNOMED_CT,
              code: input.code,
              display: input.display,
            },
          ],
          text: input.display,
        }
      : { text: input.display },
    subject: { reference: patientRef },
    recordedDate: new Date().toISOString(),
    encounter: opts.encounterRef ? { reference: opts.encounterRef } : undefined,
  });
}

/** Build an active Goal carrying a free-text description. */
export function buildGoal(description: string, patientRef: string): Goal {
  return GoalHelper.build({
    lifecycleStatus: 'active',
    description: { text: description },
    subject: { reference: patientRef },
  });
}

/** Build an active CareTeam from name/role members. */
export function buildCareTeam(
  members: { name: string; role?: string }[],
  patientRef: string,
): CareTeam {
  return CareTeamHelper.build({
    status: 'active',
    subject: { reference: patientRef },
    participant: members.map((m) => ({
      role: m.role ? [{ text: m.role }] : undefined,
      member: { display: m.name },
    })),
  });
}

/** Build an active CarePlan (intent plan) linking conditions, goals, careTeam and activities. */
export function buildCarePlan(args: {
  patientRef: string;
  title?: string;
  description?: string;
  created: string;
  addresses: Reference[];
  goals: Reference[];
  careTeam: Reference[];
  activities: ActivityInputDto[];
  /** Origin Encounter when the plan is opened from an episode (M3b → M3a). */
  encounterRef?: string;
}): CarePlan {
  return CarePlanHelper.build({
    status: 'active',
    intent: 'plan',
    title: args.title,
    description: args.description,
    subject: { reference: args.patientRef },
    created: args.created,
    encounter: args.encounterRef ? { reference: args.encounterRef } : undefined,
    addresses: args.addresses.length ? args.addresses : undefined,
    goal: args.goals.length ? args.goals : undefined,
    careTeam: args.careTeam.length ? args.careTeam : undefined,
    activity: args.activities.length ? args.activities.map(toActivity) : undefined,
  });
}

/** Map an activity DTO → FHIR CarePlan.activity (status defaults to not-started). */
export function toActivity(input: ActivityInputDto): NonNullable<CarePlan['activity']>[number] {
  return {
    detail: {
      status: input.status ?? 'not-started',
      description: input.description,
    },
  };
}

/** Build a clinical Flag that surfaces a pending CarePlan review on the patient. */
export function buildReviewFlag(patientRef: string, reason: string): Flag {
  return {
    resourceType: 'Flag',
    status: 'active',
    category: [{ coding: [{ system: FLAG_CATEGORY_SYSTEM, code: 'clinical' }] }],
    code: {
      coding: [{ system: HphiiUrls.CAREPLAN_REVIEW, code: REVIEW_FLAG_CODE }],
      text: reason,
    },
    subject: { reference: patientRef },
    period: { start: new Date().toISOString() },
  };
}

/* ============================================================
 * Review marker — complex extension (ARCH.md §8)
 * ============================================================ */

/** Build the CAREPLAN_REVIEW complex extension (status + reason + timestamps). */
export function buildReviewExtension(info: {
  status: CarePlanReviewStatus;
  reason?: string;
  requestedAt?: string;
  clearedAt?: string;
}): Extension {
  const sub: Extension[] = [{ url: 'status', valueString: info.status }];
  if (info.reason) sub.push({ url: 'reason', valueString: info.reason });
  if (info.requestedAt) sub.push({ url: 'requestedAt', valueDateTime: info.requestedAt });
  if (info.clearedAt) sub.push({ url: 'clearedAt', valueDateTime: info.clearedAt });
  return { url: HphiiUrls.CAREPLAN_REVIEW, extension: sub };
}

/** Upsert the CAREPLAN_REVIEW extension by url (mutates the array). */
export function upsertReviewExtension(extensions: Extension[], next: Extension): void {
  const idx = extensions.findIndex((ext) => ext.url === HphiiUrls.CAREPLAN_REVIEW);
  if (idx >= 0) extensions[idx] = next;
  else extensions.push(next);
}

/** Read the CAREPLAN_REVIEW marker from a resource's extensions. */
export function readReview(extensions: Extension[] | undefined): CarePlanReviewInfo {
  const parent = extensions?.find((ext) => ext.url === HphiiUrls.CAREPLAN_REVIEW);
  if (!parent?.extension) return { needed: false };
  const sub = (url: string): string | undefined => {
    const found = parent.extension?.find((e) => e.url === url);
    return found?.valueString ?? found?.valueDateTime;
  };
  const status = sub('status') as CarePlanReviewStatus | undefined;
  return {
    needed: status === CarePlanReviewStatus.NEEDED,
    status,
    reason: sub('reason'),
    requestedAt: sub('requestedAt'),
    clearedAt: sub('clearedAt'),
  };
}

/* ============================================================
 * Projections (FHIR → API summaries)
 * ============================================================ */

/** Flatten a Condition for the pathway view. */
export function projectCondition(condition: Condition): ConditionSummary {
  return {
    id: condition.id ?? '',
    display: condition.code?.text ?? condition.code?.coding?.[0]?.display,
    code: condition.code?.coding?.[0]?.code,
    clinicalStatus: condition.clinicalStatus?.coding?.[0]?.code,
    category: condition.category?.[0]?.coding?.[0]?.code,
    recordedDate: condition.recordedDate,
    encounterReference: condition.encounter?.reference,
  };
}

/** Flatten a CarePlan, resolving its linked Goals, CareTeams and Conditions. */
export function projectCarePlan(
  carePlan: CarePlan,
  linked: { goals: Goal[]; careTeams: CareTeam[]; conditions: Condition[] },
): CarePlanSummary {
  const goalById = new Map(linked.goals.map((g) => [g.id, g]));
  const teamById = new Map(linked.careTeams.map((t) => [t.id, t]));
  const conditionById = new Map(linked.conditions.map((c) => [c.id, c]));

  const goals = (carePlan.goal ?? [])
    .map((ref) => goalById.get(refId(ref.reference)))
    .map((g) => g?.description?.text)
    .filter((text): text is string => Boolean(text));

  const careTeam = (carePlan.careTeam ?? [])
    .map((ref) => teamById.get(refId(ref.reference)))
    .flatMap((team) => (team?.participant ?? []).map((p) => p.member?.display))
    .filter((name): name is string => Boolean(name));

  const conditions = (carePlan.addresses ?? [])
    .map((ref) => conditionById.get(refId(ref.reference)))
    .filter((c): c is Condition => Boolean(c))
    .map(projectCondition);

  const activities: ActivitySummary[] = (carePlan.activity ?? []).map((a) => ({
    description: a.detail?.description ?? '',
    status: a.detail?.status,
  }));

  return {
    id: carePlan.id ?? '',
    status: carePlan.status,
    intent: carePlan.intent,
    title: carePlan.title,
    description: carePlan.description,
    created: carePlan.created,
    review: readReview(carePlan.extension),
    goals,
    activities,
    careTeam,
    conditions,
  };
}

/** Flatten an Encounter for the pathway view, attaching its encounter-diagnosis Conditions. */
export function projectEpisode(encounter: Encounter, conditions: Condition[]): EpisodeSummary {
  const encounterRef = encounter.id ? `Encounter/${encounter.id}` : undefined;
  const linked = conditions
    .filter((c) => encounterRef && c.encounter?.reference === encounterRef)
    .map(projectCondition);
  return {
    id: encounter.id ?? '',
    status: encounter.status,
    class: encounter.class?.code ?? encounter.class?.display,
    active: isActiveEncounterStatus(encounter.status),
    start: encounter.period?.start,
    end: encounter.period?.end,
    reason: encounter.reasonCode?.[0]?.text,
    conditions: linked,
  };
}

/** Build an emergency/ambulatory Encounter.class coding. */
export function encounterClass(emergency: boolean | undefined): NonNullable<Encounter['class']> {
  return emergency
    ? { system: ACT_CODE_SYSTEM, code: 'EMER', display: 'emergency' }
    : { system: ACT_CODE_SYSTEM, code: 'AMB', display: 'ambulatory' };
}
