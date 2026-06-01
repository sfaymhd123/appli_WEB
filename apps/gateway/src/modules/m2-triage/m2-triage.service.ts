import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Coding, Encounter, Extension, Patient, Task } from 'fhir/r4';
import {
  AcknowledgementStatus,
  DetectedIssueSeverity,
  HphiiUrls,
  TriagePriority,
  triagePriorityRank,
  type TriageOutcome,
} from '@hphii/fhir-domain';

import {
  ALERT_ESCALATION_QUEUE,
  ESCALATION_JOB,
  type EscalationJobData,
} from '../../core/events';
import {
  DetectedIssueHelper,
  EncounterHelper,
  FhirService,
  TaskHelper,
} from '../../core/fhir';
import { NotificationService } from '../../core/notifications';
import type { CreateTriageDto } from './dto/create-triage.dto';
import type { UpdateTriageDto } from './dto/update-triage.dto';
import { runTriage, type TriageFinding } from './triage-engine';
import type {
  TriageAlert,
  TriageQueueEntry,
  TriageQueueResult,
  TriageResponse,
} from './m2-triage.types';

const ACT_CODE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

/** P-level → standard FHIR Task.priority. */
const TASK_PRIORITY: Record<TriagePriority, NonNullable<Task['priority']>> = {
  P1: 'stat',
  P2: 'asap',
  P3: 'urgent',
  P4: 'routine',
  P5: 'routine',
};

/** Triage outcome → resulting Encounter.status. */
const OUTCOME_STATUS: Record<TriageOutcome, Encounter['status']> = {
  admitted: 'in-progress',
  'in-observation': 'in-progress',
  discharged: 'finished',
  'referred-external': 'finished',
};

/**
 * M2 — Triage. Runs the algorithmic rule engine, then materialises the decision
 * as a FHIR Encounter (class emergency/ambulatory) + a Task carrying the
 * priority. A P1 (critical) result also raises a DetectedIssue and alerts
 * the referring nurse (SMS + in-app) with a 15-min escalation timer. All HAPI
 * access is via FhirService; notifications via NotificationService.
 */
@Injectable()
export class M2TriageService {
  private readonly logger = new Logger(M2TriageService.name);

  constructor(
    private readonly fhir: FhirService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
    @InjectQueue(ALERT_ESCALATION_QUEUE)
    private readonly escalationQueue: Queue<EscalationJobData>,
  ) {}

  /** Triage a patient: compute priority, create Encounter + Task, alert if P1. */
  async triage(dto: CreateTriageDto): Promise<TriageResponse> {
    // Confirm the patient exists (404s early; also anchors the AuditEvent entity).
    await this.fhir.read<Patient>('Patient', dto.patientId);

    const result = runTriage({
      vitals: {
        systolicBp: dto.systolicBp,
        diastolicBp: dto.diastolicBp,
        heartRate: dto.heartRate,
        glucose: dto.glucose,
        respiratoryRate: dto.respiratoryRate,
        temperature: dto.temperature,
      },
      symptomSeverity: dto.symptomSeverity,
    });

    const patientRef = `Patient/${dto.patientId}`;
    const now = new Date().toISOString();
    const summary = result.findings.map((f) => f.detail).join(' ');

    const encounterResource = EncounterHelper.build({
      status: 'triaged',
      class: encounterClass(result.priority),
      subject: { reference: patientRef },
      period: { start: now },
      reasonCode: dto.complaint ? [{ text: dto.complaint }] : undefined,
      extension: [priorityExtension(result.priority)],
    });

    // §8 offline-first idempotency: a triage queued offline and replayed on
    // reconnect carries a stable client-request-id. Conditional-create keys the
    // Encounter on it so the replay matches the original instead of duplicating
    // the Encounter, its Task, and (for P1) the critical alert + SMS.
    let encounter: Encounter;
    let createdNew = true;
    if (dto.clientRequestId) {
      encounterResource.identifier = [
        { system: HphiiUrls.CLIENT_REQUEST_ID, value: dto.clientRequestId },
      ];
      const outcome = await this.fhir.conditionalCreate(
        encounterResource,
        `identifier=${HphiiUrls.CLIENT_REQUEST_ID}|${dto.clientRequestId}`,
      );
      encounter = outcome.resource;
      createdNew = outcome.created;
    } else {
      encounter = await this.fhir.create(encounterResource);
    }

    // Replay matched an existing triage Encounter: return its original Task and do
    // not re-fire the P1 alert/SMS — the first pass already raised it, so no alert
    // is lost (§8). Only the degenerate "Encounter exists but Task missing" case
    // falls through to recreate the Task (still suppressing the one-shot alert).
    if (!createdNew) {
      const existingTask = await this.findLinkedTask(encounter.id);
      if (existingTask) {
        this.logger.log(`Triage replay matched Encounter/${encounter.id ?? '?'} (deduplicated)`);
        return {
          priority: result.priority,
          critical: result.critical,
          findings: result.findings,
          encounter,
          task: existingTask,
          deduplicated: true,
        };
      }
    }

    const task = await this.fhir.create(
      TaskHelper.build({
        status: 'requested',
        intent: 'order',
        priority: TASK_PRIORITY[result.priority],
        description: `Triage ${result.priority} — ${summary}`.trim(),
        for: { reference: patientRef },
        focus: encounter.id ? { reference: `Encounter/${encounter.id}` } : undefined,
        authoredOn: now,
        extension: [priorityExtension(result.priority)],
      }),
    );

    this.logger.log(`Triage ${result.priority} → Encounter/${encounter.id ?? '?'} + Task/${task.id ?? '?'}`);

    const response: TriageResponse = {
      priority: result.priority,
      critical: result.critical,
      findings: result.findings,
      encounter,
      task,
    };
    if (!createdNew) response.deduplicated = true;

    // §8: P1 (critical, ~7.8%) auto-creates a high DetectedIssue + SMS to the nurse.
    // Suppressed on a replay match — the original triage already alerted.
    if (result.critical && createdNew) {
      response.alert = await this.createCriticalAlert(patientRef, result.findings);
    }
    return response;
  }

  /** Validate/override priority or record an outcome on an existing triage Encounter. */
  async updateTriage(encounterId: string, dto: UpdateTriageDto): Promise<Encounter> {
    const encounter = await this.fhir.read<Encounter>('Encounter', encounterId);
    const extensions = [...(encounter.extension ?? [])];

    if (dto.priority) {
      setExtension(extensions, HphiiUrls.TRIAGE_PRIORITY, dto.priority);
      encounter.class = encounterClass(dto.priority);
    }
    if (dto.outcome) {
      setExtension(extensions, HphiiUrls.TRIAGE_OUTCOME, dto.outcome);
      encounter.status = OUTCOME_STATUS[dto.outcome];
      if (dto.outcome === 'referred-external' && dto.referralFacility) {
        encounter.hospitalization = {
          ...(encounter.hospitalization ?? {}),
          destination: { display: dto.referralFacility },
        };
      }
    }
    encounter.extension = extensions;

    const updated = await this.fhir.update(encounter);

    // Keep the linked Task in sync (priority / closure) when present.
    if (dto.priority || dto.outcome) {
      await this.syncLinkedTask(encounterId, dto);
    }
    return updated;
  }

  /** Today's triaged encounters, most-urgent first. */
  async queueToday(): Promise<TriageQueueResult> {
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const bundle = await this.fhir.search<Encounter>('Encounter', {
      date: `ge${dateStr}`,
      _count: 200,
      _sort: '-date',
    });

    const entries: TriageQueueEntry[] = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is Encounter => EncounterHelper.is(resource))
      .filter(hasTriagePriority) // only M2-triaged encounters
      .map(toQueueEntry);

    entries.sort(byPriorityThenRecency);
    return { date: dateStr, total: entries.length, entries };
  }

  /** Raise a high-severity DetectedIssue for a P1 triage and alert the referring nurse. */
  private async createCriticalAlert(
    patientRef: string,
    findings: TriageFinding[],
  ): Promise<TriageAlert> {
    const escalationMinutes = this.config.get<number>('alertEscalationMinutes') ?? 15;
    const detail = `Triage critique (P1) — ${findings.map((f) => f.detail).join(' ')}`.trim();

    const detectedIssue = await this.fhir.create(
      DetectedIssueHelper.build({
        status: 'registered',
        severity: DetectedIssueSeverity.HIGH,
        patient: { reference: patientRef },
        identifiedDateTime: new Date().toISOString(),
        detail,
        extension: [
          { url: HphiiUrls.ALERT_SOURCE, valueString: 'M2-Triage' },
          { url: HphiiUrls.ACKNOWLEDGEMENT_STATUS, valueString: AcknowledgementStatus.PENDING },
          { url: HphiiUrls.ESCALATION_TIMER_MINUTES, valueInteger: escalationMinutes },
        ],
      }),
    );

    // PHI-safe (ARCH.md §9): reference the DetectedIssue id + priority only.
    const issueRef = detectedIssue.id ? `DetectedIssue/${detectedIssue.id}` : 'DetectedIssue';
    const dispatch = await this.notifications.notify({
      kind: 'alert.created',
      to: this.config.get<string>('referringNursePhone') ?? '',
      body: `ALERTE P1 (critique) — nouvelle détection ${issueRef}. Acquittement requis sous ${escalationMinutes} min.`,
      detectedIssueId: detectedIssue.id,
      patient: patientRef,
      severity: DetectedIssueSeverity.HIGH,
      urgent: true,
    });

    if (detectedIssue.id) await this.scheduleEscalation(detectedIssue.id);

    this.logger.warn(
      `P1 triage raised DetectedIssue/${detectedIssue.id ?? '?'} + alerts via ${dispatch.smsProvider ?? 'none'}`,
    );

    return {
      detectedIssue,
      sms: {
        provider: dispatch.smsProvider ?? 'none',
        to: this.config.get<string>('referringNursePhone') ?? '',
        accepted: dispatch.smsAccepted,
      },
    };
  }

  /** Enqueue the delayed escalation job keyed by the DetectedIssue id. */
  private async scheduleEscalation(detectedIssueId: string): Promise<void> {
    const seconds = this.config.get<number>('alertEscalationSeconds') ?? 0;
    const delay = seconds > 0 ? seconds * 1000 : (this.config.get<number>('alertEscalationMinutes') ?? 15) * 60_000;

    try {
      await this.escalationQueue.add(
        ESCALATION_JOB,
        { detectedIssueId },
        { jobId: `alert-${detectedIssueId}`, delay, removeOnComplete: true, removeOnFail: false },
      );
      this.logger.warn(`Escalation armed for DetectedIssue/${detectedIssueId} (+${delay}ms)`);
    } catch (error) {
      this.logger.error(
        `Failed to arm escalation for DetectedIssue/${detectedIssueId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  /** First Task whose focus is this Encounter (the triage Task), if any. */
  private async findLinkedTask(encounterId: string | undefined): Promise<Task | undefined> {
    if (!encounterId) return undefined;
    const bundle = await this.fhir.search<Task>('Task', {
      focus: `Encounter/${encounterId}`,
      _count: 5,
    });
    return (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .find((resource): resource is Task => TaskHelper.is(resource));
  }

  /** Update Task(s) whose focus is this Encounter to match a priority/outcome change. */
  private async syncLinkedTask(encounterId: string, dto: UpdateTriageDto): Promise<void> {
    const bundle = await this.fhir.search<Task>('Task', {
      focus: `Encounter/${encounterId}`,
      _count: 5,
    });
    const tasks = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is Task => TaskHelper.is(resource));

    for (const task of tasks) {
      if (!task.id) continue;
      const extensions = [...(task.extension ?? [])];
      if (dto.priority) {
        task.priority = TASK_PRIORITY[dto.priority];
        setExtension(extensions, HphiiUrls.TRIAGE_PRIORITY, dto.priority);
      }
      if (dto.outcome) {
        task.status =
          dto.outcome === 'referred-external' || dto.outcome === 'discharged'
            ? 'completed'
            : 'in-progress';
      }
      task.extension = extensions;
      await this.fhir.update(task);
    }
  }
}

/* ----- module-level helpers (pure) ----- */

/** P-level → FHIR Encounter.class (emergency for P1/P2, else ambulatory). */
function encounterClass(priority: TriagePriority): Coding {
  return triagePriorityRank(priority) <= 2
    ? { system: ACT_CODE_SYSTEM, code: 'EMER', display: 'emergency' }
    : { system: ACT_CODE_SYSTEM, code: 'AMB', display: 'ambulatory' };
}

function priorityExtension(priority: TriagePriority): Extension {
  return { url: HphiiUrls.TRIAGE_PRIORITY, valueString: priority };
}

/** Upsert a valueString extension by url. */
function setExtension(extensions: Extension[], url: string, valueString: string): void {
  const next: Extension = { url, valueString };
  const idx = extensions.findIndex((ext) => ext.url === url);
  if (idx >= 0) extensions[idx] = next;
  else extensions.push(next);
}

function extString(extensions: Extension[] | undefined, url: string): string | undefined {
  return extensions?.find((ext) => ext.url === url)?.valueString;
}

function hasTriagePriority(encounter: Encounter): boolean {
  return (encounter.extension ?? []).some((ext) => ext.url === HphiiUrls.TRIAGE_PRIORITY);
}

function toQueueEntry(encounter: Encounter): TriageQueueEntry {
  const priority = extString(encounter.extension, HphiiUrls.TRIAGE_PRIORITY) as
    | TriagePriority
    | undefined;
  return {
    encounterId: encounter.id ?? '',
    priority: priority ?? null,
    status: encounter.status,
    patientReference: encounter.subject?.reference,
    start: encounter.period?.start,
    outcome: extString(encounter.extension, HphiiUrls.TRIAGE_OUTCOME),
  };
}

function byPriorityThenRecency(a: TriageQueueEntry, b: TriageQueueEntry): number {
  const ra = a.priority ? triagePriorityRank(a.priority) : 99;
  const rb = b.priority ? triagePriorityRank(b.priority) : 99;
  if (ra !== rb) return ra - rb;
  return (b.start ?? '').localeCompare(a.start ?? '');
}
