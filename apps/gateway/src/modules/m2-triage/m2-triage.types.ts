import type { DetectedIssue, Encounter, Task } from 'fhir/r4';
import type { TriagePriority } from '@hphii/fhir-domain';
import type { SmsSendResult } from '../../core/sms';
import type { TriageFinding } from './triage-engine';

/** The P1 critical alert: the DetectedIssue plus the SMS dispatch result. */
export interface TriageAlert {
  detectedIssue: DetectedIssue;
  sms: SmsSendResult;
}

/** Response of POST /triage — the decision plus the FHIR resources created. */
export interface TriageResponse {
  priority: TriagePriority;
  critical: boolean;
  findings: TriageFinding[];
  encounter: Encounter;
  task: Task;
  /** Present only for P1 (critical) triage. */
  alert?: TriageAlert;
  /**
   * True when a client-request-id matched an existing triage Encounter (offline
   * replay): the Encounter/Task were not duplicated and no new P1 alert/SMS was
   * fired (§8). The previously created Task is returned as-is.
   */
  deduplicated?: boolean;
}

/** A row in the triage queue. */
export interface TriageQueueEntry {
  encounterId: string;
  priority: TriagePriority | null;
  status: string;
  patientReference?: string;
  start?: string;
  outcome?: string;
}

export interface TriageQueueResult {
  /** YYYY-MM-DD the queue was computed for. */
  date: string;
  total: number;
  entries: TriageQueueEntry[];
}
