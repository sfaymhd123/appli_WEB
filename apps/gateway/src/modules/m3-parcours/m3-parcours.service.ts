import { Injectable, Logger } from '@nestjs/common';
import type {
  Bundle,
  CarePlan,
  CareTeam,
  Condition,
  Encounter,
  FhirResource,
  Flag,
  Goal,
  Patient,
  Reference,
} from 'fhir/r4';
import { CarePlanReviewStatus } from '@hphii/fhir-domain';

import {
  CarePlanHelper,
  CareTeamHelper,
  ConditionHelper,
  EncounterHelper,
  FhirService,
  FlagHelper,
  GoalHelper,
} from '../../core/fhir';
import type { CreateCarePlanDto } from './dto/create-care-plan.dto';
import type { UpdateCarePlanDto } from './dto/update-care-plan.dto';
import type { ClosePathwayDto } from './dto/close-pathway.dto';
import type { CreateEpisodeDto } from './dto/create-episode.dto';
import type { SwitchToChronicDto } from './dto/switch-to-chronic.dto';
import {
  buildCarePlan,
  buildCareTeam,
  buildCondition,
  buildGoal,
  buildReviewExtension,
  buildReviewFlag,
  classifyPathway,
  encounterClass,
  isActiveCarePlanStatus,
  isActiveEncounterStatus,
  projectCarePlan,
  projectCondition,
  projectEpisode,
  readReview,
  refId,
  REVIEW_FLAG_CODE,
  toActivity,
  upsertReviewExtension,
} from './pathway-engine';
import type {
  CarePlanResult,
  EpisodeResult,
  PathwayResult,
} from './m3-parcours.types';
import { withDemoPathway } from './demo-pathways';

/**
 * M3 — Parcours chronique (M3a) & épisodique (M3b). Materialises the
 * chronic/episodic bifurcation as FHIR resources via FhirService:
 *   - chronic  → CarePlan + Goal(s) + CareTeam + addressed Condition(s) + Flag
 *   - episodic → Encounter + encounter-diagnosis Condition(s)
 * Reacts to the M4 "CarePlan review needed" event (HbA1c > 7, ARCH.md §8) by
 * marking active plans for review. All HAPI access is via FhirService (§9).
 */
@Injectable()
export class M3ParcoursService {
  private readonly logger = new Logger(M3ParcoursService.name);

  constructor(private readonly fhir: FhirService) {}

  /* ----- M3a chronic ----- */

  /** Open a chronic CarePlan: create Conditions, Goals, optional CareTeam, then the CarePlan. */
  async createCarePlan(dto: CreateCarePlanDto): Promise<CarePlanResult> {
    // Confirm the patient exists (404s early; also anchors the AuditEvent entity).
    await this.fhir.read<Patient>('Patient', dto.patientId);
    const patientRef = `Patient/${dto.patientId}`;
    const now = new Date().toISOString();

    const conditions = await Promise.all(
      (dto.conditions ?? []).map((c) =>
        this.fhir.create(buildCondition(c, patientRef, { category: 'problem-list-item' })),
      ),
    );
    const goals = await Promise.all(
      (dto.goals ?? []).map((g) => this.fhir.create(buildGoal(g, patientRef))),
    );
    const careTeams: CareTeam[] = [];
    if (dto.careTeam?.length) {
      careTeams.push(await this.fhir.create(buildCareTeam(dto.careTeam, patientRef)));
    }

    const carePlan = await this.fhir.create(
      buildCarePlan({
        patientRef,
        title: dto.title,
        description: dto.description,
        created: now,
        addresses: toRefs('Condition', conditions),
        goals: toRefs('Goal', goals),
        careTeam: toRefs('CareTeam', careTeams),
        activities: dto.activities ?? [],
      }),
    );

    this.logger.log(
      `CarePlan/${carePlan.id ?? '?'} opened for ${patientRef} ` +
        `(${conditions.length} condition(s), ${goals.length} goal(s), ${careTeams.length} careTeam)`,
    );
    return { carePlan, summary: projectCarePlan(carePlan, { goals, careTeams, conditions }) };
  }

  /** Adjust a chronic CarePlan: title/description/status, replace activities, add goals. */
  async updateCarePlan(carePlanId: string, dto: UpdateCarePlanDto): Promise<CarePlan> {
    const carePlan = await this.fhir.read<CarePlan>('CarePlan', carePlanId);
    if (dto.title !== undefined) carePlan.title = dto.title;
    if (dto.description !== undefined) carePlan.description = dto.description;
    if (dto.status) carePlan.status = dto.status;
    if (dto.activities) carePlan.activity = dto.activities.map(toActivity);

    if (dto.addGoals?.length) {
      const patientRef = carePlan.subject?.reference ?? '';
      const newGoals = await Promise.all(
        dto.addGoals.map((g) => this.fhir.create(buildGoal(g, patientRef))),
      );
      carePlan.goal = [...(carePlan.goal ?? []), ...toRefs('Goal', newGoals)];
    }

    const updated = await this.fhir.update(carePlan);
    this.logger.log(`CarePlan/${carePlanId} updated (status ${updated.status})`);
    return updated;
  }

  /** Close (complete) or cancel (revoke) a chronic CarePlan, appending a note. */
  async closeCarePlan(carePlanId: string, dto: ClosePathwayDto): Promise<CarePlan> {
    const carePlan = await this.fhir.read<CarePlan>('CarePlan', carePlanId);
    carePlan.status = dto.cancelled ? 'revoked' : 'completed';
    carePlan.note = [
      ...(carePlan.note ?? []),
      {
        text: `${dto.cancelled ? 'Parcours annulé' : 'Parcours clôturé'}${dto.reason ? ` : ${dto.reason}` : ''}`,
        time: new Date().toISOString(),
      },
    ];
    const updated = await this.fhir.update(carePlan);
    this.logger.log(`CarePlan/${carePlanId} closed (status ${updated.status})`);
    return updated;
  }

  /** Clear a pending review marker on a CarePlan and inactivate the patient's review Flags. */
  async acknowledgeReview(carePlanId: string): Promise<CarePlan> {
    const carePlan = await this.fhir.read<CarePlan>('CarePlan', carePlanId);
    const current = readReview(carePlan.extension);
    const extensions = [...(carePlan.extension ?? [])];
    upsertReviewExtension(
      extensions,
      buildReviewExtension({
        status: CarePlanReviewStatus.CLEARED,
        reason: current.reason,
        requestedAt: current.requestedAt,
        clearedAt: new Date().toISOString(),
      }),
    );
    carePlan.extension = extensions;
    const updated = await this.fhir.update(carePlan);

    if (carePlan.subject?.reference) {
      await this.inactivateReviewFlags(carePlan.subject.reference);
    }
    this.logger.log(`CarePlan/${carePlanId} review acknowledged (cleared)`);
    return updated;
  }

  /* ----- M3b episodic ----- */

  /** Open an acute episode: an in-progress Encounter + encounter-diagnosis Condition(s). */
  async createEpisode(dto: CreateEpisodeDto): Promise<EpisodeResult> {
    await this.fhir.read<Patient>('Patient', dto.patientId);
    const patientRef = `Patient/${dto.patientId}`;
    const now = new Date().toISOString();

    const encounter = await this.fhir.create(
      EncounterHelper.build({
        status: 'in-progress',
        class: encounterClass(dto.emergency),
        subject: { reference: patientRef },
        period: { start: now },
        reasonCode: dto.complaint ? [{ text: dto.complaint }] : undefined,
      }),
    );

    const encounterRef = `Encounter/${encounter.id}`;
    const conditions = await Promise.all(
      (dto.conditions ?? []).map((c) =>
        this.fhir.create(
          buildCondition(c, patientRef, { category: 'encounter-diagnosis', encounterRef }),
        ),
      ),
    );

    this.logger.log(
      `Encounter/${encounter.id ?? '?'} (episode) opened for ${patientRef} ` +
        `(${conditions.length} diagnosis condition(s))`,
    );
    return { encounter, summary: projectEpisode(encounter, conditions) };
  }

  /** Close (finish) or cancel an episode Encounter, stamping period.end. */
  async closeEpisode(episodeId: string, dto: ClosePathwayDto): Promise<Encounter> {
    const encounter = await this.fhir.read<Encounter>('Encounter', episodeId);
    encounter.status = dto.cancelled ? 'cancelled' : 'finished';
    encounter.period = { ...(encounter.period ?? {}), end: new Date().toISOString() };
    const updated = await this.fhir.update(encounter);
    this.logger.log(`Encounter/${episodeId} closed (status ${updated.status})`);
    return updated;
  }

  /** Convert an episode into a chronic CarePlan addressing the episode's Conditions (M3b → M3a). */
  async switchToChronic(episodeId: string, dto: SwitchToChronicDto): Promise<CarePlanResult> {
    const encounter = await this.fhir.read<Encounter>('Encounter', episodeId);
    const patientRef = encounter.subject?.reference;
    if (!patientRef) {
      throw new Error(`Encounter/${episodeId} has no subject; cannot switch to chronic.`);
    }
    const encounterRef = `Encounter/${episodeId}`;
    const now = new Date().toISOString();

    // Reuse the episode's existing diagnoses as the chronic plan's addressed problems.
    const conditionBundle = await this.fhir.search<Condition>('Condition', {
      encounter: encounterRef,
      _count: 100,
    });
    const conditions = this.collect(conditionBundle, ConditionHelper.is);

    const goals = await Promise.all(
      (dto.goals ?? []).map((g) => this.fhir.create(buildGoal(g, patientRef))),
    );

    const carePlan = await this.fhir.create(
      buildCarePlan({
        patientRef,
        title: dto.title ?? 'Parcours chronique (issu d’un épisode)',
        created: now,
        addresses: toRefs('Condition', conditions),
        goals: toRefs('Goal', goals),
        careTeam: [],
        activities: [],
        encounterRef,
      }),
    );

    if (dto.closeEpisode !== false) {
      encounter.status = 'finished';
      encounter.period = { ...(encounter.period ?? {}), end: now };
      await this.fhir.update(encounter);
    }

    this.logger.log(
      `Encounter/${episodeId} switched to chronic → CarePlan/${carePlan.id ?? '?'} ` +
        `(${conditions.length} condition(s) carried over)`,
    );
    return { carePlan, summary: projectCarePlan(carePlan, { goals, careTeams: [], conditions }) };
  }

  /* ----- pathway snapshot ----- */

  /** Whether the patient is chronic/episodic, with the active plan/episode and history. */
  async getPathway(patientId: string): Promise<PathwayResult> {
    await this.fhir.read<Patient>('Patient', patientId);
    const subject = `Patient/${patientId}`;

    const [carePlanBundle, encounterBundle, conditionBundle, goalBundle, careTeamBundle] =
      await Promise.all([
        this.fhir.search<CarePlan>('CarePlan', { subject, _count: 100, _sort: '-_lastUpdated' }),
        this.fhir.search<Encounter>('Encounter', { subject, _count: 100, _sort: '-date' }),
        this.fhir.search<Condition>('Condition', { subject, _count: 200 }),
        this.fhir.search<Goal>('Goal', { subject, _count: 200 }),
        this.fhir.search<CareTeam>('CareTeam', { subject, _count: 100 }),
      ]);

    const conditions = this.collect(conditionBundle, ConditionHelper.is);
    const goals = this.collect(goalBundle, GoalHelper.is);
    const careTeams = this.collect(careTeamBundle, CareTeamHelper.is);

    const carePlans = this.collect(carePlanBundle, CarePlanHelper.is).map((cp) =>
      projectCarePlan(cp, { goals, careTeams, conditions }),
    );
    const episodes = this.collect(encounterBundle, EncounterHelper.is).map((enc) =>
      projectEpisode(enc, conditions),
    );

    const activeCarePlan = carePlans.find((cp) => isActiveCarePlanStatus(cp.status));
    const activeEpisode = episodes.find((ep) => ep.active);
    const chronic = Boolean(activeCarePlan);
    const episodic = Boolean(activeEpisode);

    return withDemoPathway({
      patientId,
      classification: classifyPathway(chronic, episodic),
      chronic,
      episodic,
      activeCarePlan,
      carePlans,
      activeEpisode,
      episodes,
      conditions: conditions.map(projectCondition),
    });
  }

  /* ----- M4 event reaction (ARCH.md §8) ----- */

  /**
   * React to a "CarePlan review needed" event: mark every active CarePlan of the
   * patient with the review extension (status Needed) and ensure a review Flag.
   * Returns the number of plans flagged. Idempotent on the Flag.
   */
  async handleReviewNeeded(patientRef: string, reason: string): Promise<number> {
    const patientId = refId(patientRef);
    if (!patientId) return 0;
    const subject = `Patient/${patientId}`;
    const now = new Date().toISOString();

    const bundle = await this.fhir.search<CarePlan>('CarePlan', { subject, _count: 100 });
    const active = this.collect(bundle, CarePlanHelper.is).filter((cp) =>
      isActiveCarePlanStatus(cp.status),
    );

    for (const carePlan of active) {
      const extensions = [...(carePlan.extension ?? [])];
      upsertReviewExtension(
        extensions,
        buildReviewExtension({
          status: CarePlanReviewStatus.NEEDED,
          reason,
          requestedAt: now,
        }),
      );
      carePlan.extension = extensions;
      await this.fhir.update(carePlan);
    }

    await this.ensureReviewFlag(subject, reason);
    this.logger.log(`Review flagged for ${subject}: ${active.length} active CarePlan(s)`);
    return active.length;
  }

  /* ----- private helpers ----- */

  /** Create a review Flag only if no active one already exists (idempotent). */
  private async ensureReviewFlag(patientRef: string, reason: string): Promise<void> {
    const bundle = await this.fhir.search<Flag>('Flag', {
      subject: patientRef,
      status: 'active',
      _count: 50,
    });
    const existing = this.collect(bundle, FlagHelper.is).some((flag) =>
      flag.code?.coding?.some((c) => c.code === REVIEW_FLAG_CODE),
    );
    if (!existing) {
      await this.fhir.create(buildReviewFlag(patientRef, reason));
    }
  }

  /** Set the patient's active review Flags to inactive (called on acknowledge). */
  private async inactivateReviewFlags(patientRef: string): Promise<void> {
    const bundle = await this.fhir.search<Flag>('Flag', {
      subject: patientRef,
      status: 'active',
      _count: 50,
    });
    const flags = this.collect(bundle, FlagHelper.is).filter((flag) =>
      flag.code?.coding?.some((c) => c.code === REVIEW_FLAG_CODE),
    );
    for (const flag of flags) {
      flag.status = 'inactive';
      await this.fhir.update(flag);
    }
  }

  /** Filter a Bundle's entries down to a single resource type via its guard. */
  private collect<T extends FhirResource>(
    bundle: Bundle,
    is: (value: unknown) => value is T,
  ): T[] {
    return (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is T => resource !== undefined && is(resource));
  }
}

/** Build typed references for resources that already have ids (post-create). */
function toRefs(resourceType: string, resources: { id?: string }[]): Reference[] {
  return resources
    .filter((r): r is { id: string } => typeof r.id === 'string' && r.id.length > 0)
    .map((r) => ({ reference: `${resourceType}/${r.id}` }));
}
