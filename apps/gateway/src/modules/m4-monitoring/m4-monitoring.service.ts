import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { DetectedIssue, Observation, Patient } from 'fhir/r4';
import {
  AcknowledgementStatus,
  CodeSystems,
  type DetectedIssueSeverity,
  HphiiUrls,
  type ObservationSpec,
  evaluateThreshold,
} from '@hphii/fhir-domain';

import {
  ALERT_ESCALATION_QUEUE,
  DomainEventBus,
  ESCALATION_JOB,
  type DomainEvent,
  type EscalationJobData,
} from '../../core/events';
import { DetectedIssueHelper, FhirService, ObservationHelper } from '../../core/fhir';
import { NotificationService, type NotificationDispatchResult } from '../../core/notifications';
import type { AlertActionDto } from './dto/alert-action.dto';
import type { CreateObservationDto } from './dto/create-observation.dto';
import {
  buildObservationResource,
  extString,
  projectAlert,
  projectTrend,
  setExtString,
  specByMetric,
} from './monitoring-engine';
import type { AlertsResult, AlertSummary, ObservationResult, VitalsTrend } from './m4-monitoring.types';

/**
 * M4 — Monitoring, alerts & escalation (ARCH.md §7/§8). Captures coded vitals,
 * runs the §7 threshold engine, raises DetectedIssue alerts with a 15-min BullMQ
 * escalation timer, and drives the acknowledge → resolve lifecycle. All HAPI
 * access is via FhirService; all notifications via NotificationService.
 */
@Injectable()
export class M4MonitoringService {
  private readonly logger = new Logger(M4MonitoringService.name);

  constructor(
    private readonly fhir: FhirService,
    private readonly notifications: NotificationService,
    private readonly events: DomainEventBus,
    private readonly config: ConfigService,
    @InjectQueue(ALERT_ESCALATION_QUEUE)
    private readonly escalationQueue: Queue<EscalationJobData>,
  ) {}

  /** Submit a reading → coded Observation, then evaluate §7 thresholds. */
  async createObservation(dto: CreateObservationDto): Promise<ObservationResult> {
    const spec = specByMetric(dto.metric);
    if (!spec) throw new BadRequestException(`Unknown metric '${dto.metric}'`);

    // Confirm the patient exists (404s early; also anchors the AuditEvent entity).
    const patient = await this.fhir.read<Patient>('Patient', dto.patientId);
    const sex =
      patient.gender === 'male' || patient.gender === 'female' ? patient.gender : undefined;
    const patientRef = `Patient/${dto.patientId}`;
    const effectiveDateTime = dto.effectiveDateTime ?? new Date().toISOString();

    const resource = buildObservationResource({
      spec,
      patientRef,
      value: dto.value,
      effectiveDateTime,
      sex,
    });

    // Offline-first idempotency (§8): when the client supplies a stable request
    // id, stamp it as an identifier and conditionally create. A replay matches
    // the existing Observation (created=false) and skips all one-shot effects.
    let observation: Observation;
    let isNew = true;
    if (dto.clientRequestId) {
      resource.identifier = [
        { system: HphiiUrls.CLIENT_REQUEST_ID, value: dto.clientRequestId },
      ];
      const outcome = await this.fhir.conditionalCreate(
        resource,
        `identifier=${HphiiUrls.CLIENT_REQUEST_ID}|${dto.clientRequestId}`,
      );
      observation = outcome.resource;
      isNew = outcome.created;
    } else {
      observation = await this.fhir.create(resource);
    }

    const evaluation = evaluateThreshold(spec, dto.value, sex);
    const result: ObservationResult = {
      observation,
      breached: evaluation.breached,
      severity: evaluation.severity,
    };

    // A replayed (already-recorded) reading is acknowledged but never re-alerted.
    if (!isNew) {
      result.deduplicated = true;
      this.logger.log(`Observation replay deduplicated (clientRequestId match) for ${patientRef}`);
      return result;
    }

    if (evaluation.breached && evaluation.severity) {
      const raised = await this.raiseAlert(spec, patientRef, evaluation.severity);
      result.alert = raised.alert;
      result.notification = raised.notification;
    }

    // HbA1c > 7 → emit a CarePlan-review event for M3 (no DetectedIssue) — §7/§8.
    if (evaluation.action === 'careplan-review') {
      result.careplanReview = true;
      this.events.emit({
        kind: 'careplan.review-needed',
        at: new Date().toISOString(),
        patient: patientRef,
        message: `Revue du plan de soins requise (${spec.label} au-dessus du seuil).`,
      });
      this.logger.warn(`CarePlan-review event emitted for ${patientRef} (${spec.label})`);
    }

    return result;
  }

  /** Acknowledge an alert: status → preliminary, ack → Acknowledged, cancel timer. */
  async acknowledgeAlert(alertId: string, _dto: AlertActionDto): Promise<DetectedIssue> {
    const issue = await this.fhir.read<DetectedIssue>('DetectedIssue', alertId);
    const updated = await this.applyStatus(
      issue,
      'preliminary',
      AcknowledgementStatus.ACKNOWLEDGED,
    );
    await this.cancelEscalation(alertId);
    this.events.emit({
      kind: 'alert.acknowledged',
      at: new Date().toISOString(),
      detectedIssueId: alertId,
      patient: issue.patient?.reference,
      severity: issue.severity,
      message: `Alerte acquittée — DetectedIssue/${alertId}.`,
    });
    this.logger.log(`DetectedIssue/${alertId} acknowledged; escalation cancelled`);
    return updated;
  }

  /** Resolve an alert: status → final (escalation timer cancelled defensively). */
  async resolveAlert(alertId: string, _dto: AlertActionDto): Promise<DetectedIssue> {
    const issue = await this.fhir.read<DetectedIssue>('DetectedIssue', alertId);
    issue.status = 'final';
    const updated = await this.fhir.update(issue);
    await this.cancelEscalation(alertId);
    this.events.emit({
      kind: 'alert.resolved',
      at: new Date().toISOString(),
      detectedIssueId: alertId,
      patient: issue.patient?.reference,
      severity: issue.severity,
      message: `Alerte résolue — DetectedIssue/${alertId}.`,
    });
    this.logger.log(`DetectedIssue/${alertId} resolved`);
    return updated;
  }

  /** Active alerts (not yet resolved), most-recent first. */
  async listActiveAlerts(): Promise<AlertsResult> {
    // FHIR R4 §DetectedIssue does NOT support the 'status' search parameter.
    // We fetch a larger page and filter gateway-side for 'active' (not resolved) ones.
    const bundle = await this.fhir.search<DetectedIssue>('DetectedIssue', {
      _count: 500,
      _sort: '-identified',
    });
    const alerts: AlertSummary[] = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is DetectedIssue => {
        if (!DetectedIssueHelper.is(resource)) return false;
        // status: registered | preliminary | final | entered-in-error.
        // Final means resolved.
        return resource.status === 'registered' || resource.status === 'preliminary';
      })
      .map(projectAlert);
    return { total: alerts.length, alerts };
  }

  /** Per-metric vitals time series for a patient (for the trend chart). */
  async getVitalsTrend(patientId: string): Promise<VitalsTrend> {
    // Confirm the patient exists (404s early; anchors the AuditEvent entity).
    await this.fhir.read<Patient>('Patient', patientId);
    const bundle = await this.fhir.search<Observation>('Observation', {
      subject: `Patient/${patientId}`,
      _count: 500,
      _sort: 'date',
    });
    const observations = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is Observation => ObservationHelper.is(resource));
    return projectTrend(patientId, observations);
  }

  /** Recent in-app events (polling fallback for the SSE notification channel). */
  recentNotifications(): DomainEvent[] {
    return this.events.recentEvents();
  }

  /**
   * Escalation worker entry point: if the alert is still Pending, mark it
   * Escalated (extension only — `escalated` is NOT a FHIR status, §8) and SMS
   * the senior physician. Idempotent and safe to run on a stale/acked alert.
   */
  async runEscalation(detectedIssueId: string): Promise<void> {
    let issue: DetectedIssue;
    try {
      issue = await this.fhir.read<DetectedIssue>('DetectedIssue', detectedIssueId);
    } catch {
      this.logger.warn(`Escalation: DetectedIssue/${detectedIssueId} not found — skipping`);
      return;
    }

    const ack = extString(issue.extension ?? [], HphiiUrls.ACKNOWLEDGEMENT_STATUS);
    if (issue.status === 'final' || ack !== AcknowledgementStatus.PENDING) {
      this.logger.log(
        `Escalation no-op for DetectedIssue/${detectedIssueId} (status=${issue.status}, ack=${ack ?? '—'})`,
      );
      return;
    }

    const ext = [...(issue.extension ?? [])];
    setExtString(ext, HphiiUrls.ACKNOWLEDGEMENT_STATUS, AcknowledgementStatus.ESCALATED);
    issue.extension = ext;
    await this.fhir.update(issue);

    const issueRef = `DetectedIssue/${detectedIssueId}`;
    await this.notifications.notify({
      kind: 'alert.escalated',
      to: this.config.get<string>('seniorPhysicianPhone') ?? '',
      body: `URGENT — alerte non acquittée ${issueRef} (sévérité ${issue.severity ?? '?'}). Escalade au médecin senior requise.`,
      detectedIssueId,
      patient: issue.patient?.reference,
      severity: issue.severity,
      urgent: true,
    });
    this.logger.warn(`${issueRef} ESCALATED → senior physician notified`);
  }

  /* ----- private helpers ----- */

  /** Create the DetectedIssue, notify the clinician, and arm the escalation timer. */
  private async raiseAlert(
    spec: ObservationSpec,
    patientRef: string,
    severity: DetectedIssueSeverity,
  ): Promise<{ alert: AlertSummary; notification: NotificationDispatchResult }> {
    const escalationMinutes = this.escalationMinutes();
    const detail = `Seuil dépassé — ${spec.label} (sévérité ${severity}).`;

    const issue = await this.fhir.create(
      DetectedIssueHelper.build({
        status: 'registered',
        severity,
        patient: { reference: patientRef },
        identifiedDateTime: new Date().toISOString(),
        detail,
        code: {
          coding: [{ system: CodeSystems.LOINC, code: spec.loinc, display: spec.label }],
        },
        extension: [
          { url: HphiiUrls.ALERT_SOURCE, valueString: 'M4-Monitoring' },
          { url: HphiiUrls.ACKNOWLEDGEMENT_STATUS, valueString: AcknowledgementStatus.PENDING },
          { url: HphiiUrls.ESCALATION_TIMER_MINUTES, valueInteger: escalationMinutes },
        ],
      }),
    );

    const issueRef = issue.id ? `DetectedIssue/${issue.id}` : 'DetectedIssue';
    const notification = await this.notifications.notify({
      kind: 'alert.created',
      to: this.config.get<string>('referringNursePhone') ?? '',
      body: `ALERTE ${severity.toUpperCase()} — ${spec.label}, ${issueRef}. Acquittement requis sous ${escalationMinutes} min.`,
      detectedIssueId: issue.id,
      patient: patientRef,
      severity,
      urgent: severity === 'high',
    });

    if (issue.id) await this.scheduleEscalation(issue.id);

    this.logger.warn(`Alert raised: ${issueRef} (${severity}) for ${patientRef}`);
    return { alert: projectAlert(issue), notification };
  }

  /** Enqueue the delayed escalation job keyed by the DetectedIssue id. */
  private async scheduleEscalation(detectedIssueId: string): Promise<void> {
    const delay = this.escalationDelayMs();
    try {
      await this.escalationQueue.add(
        ESCALATION_JOB,
        { detectedIssueId },
        { jobId: `alert-${detectedIssueId}`, delay, removeOnComplete: true, removeOnFail: false },
      );
      this.logger.warn(`Escalation armed for DetectedIssue/${detectedIssueId} (+${delay}ms)`);
    } catch (error) {
      // The alert is persisted + visible on the dashboard; only the auto-timer
      // degraded (e.g. Redis down). Logged loudly — never silently swallowed.
      this.logger.error(
        `Failed to arm escalation for DetectedIssue/${detectedIssueId}: ${describe(error)}`,
      );
    }
  }

  /** Remove a pending escalation job (acknowledge/resolve). Best-effort. */
  private async cancelEscalation(detectedIssueId: string): Promise<void> {
    try {
      const job = await this.escalationQueue.getJob(`alert-${detectedIssueId}`);
      if (job) await job.remove();
    } catch (error) {
      this.logger.warn(
        `Failed to cancel escalation for DetectedIssue/${detectedIssueId}: ${describe(error)}`,
      );
    }
  }

  /** Set DetectedIssue.status and the acknowledgement-status extension, then save. */
  private async applyStatus(
    issue: DetectedIssue,
    status: DetectedIssue['status'],
    acknowledgement: string,
  ): Promise<DetectedIssue> {
    issue.status = status;
    const ext = [...(issue.extension ?? [])];
    setExtString(ext, HphiiUrls.ACKNOWLEDGEMENT_STATUS, acknowledgement);
    issue.extension = ext;
    return this.fhir.update(issue);
  }

  private escalationMinutes(): number {
    return this.config.get<number>('alertEscalationMinutes') ?? 15;
  }

  /** Escalation delay in ms — honours the optional seconds override (demo/test). */
  private escalationDelayMs(): number {
    const seconds = this.config.get<number>('alertEscalationSeconds') ?? 0;
    return seconds > 0 ? seconds * 1000 : this.escalationMinutes() * 60_000;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
