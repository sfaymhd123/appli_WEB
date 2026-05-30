import type { DetectedIssue, Encounter, Task } from 'fhir/r4';
import type { SymptomSeverity, TriageOutcome, TriagePriority } from '@hphii/fhir-domain';

/** POST /triage request body. */
export interface TriageRequest {
  patientId: string;
  systolicBp?: number;
  diastolicBp?: number;
  heartRate?: number;
  glucose?: number;
  symptomSeverity?: SymptomSeverity;
  complaint?: string;
}

export interface TriageFinding {
  code: string;
  detail: string;
  priority: TriagePriority;
}

export interface TriageSmsResult {
  provider: string;
  to: string;
  accepted: boolean;
  reference?: string;
}

export interface TriageAlert {
  detectedIssue: DetectedIssue;
  sms: TriageSmsResult;
}

export interface TriageResponse {
  priority: TriagePriority;
  critical: boolean;
  findings: TriageFinding[];
  encounter: Encounter;
  task: Task;
  /** Present only for P1 (critical) triage. */
  alert?: TriageAlert;
}

export interface TriageQueueEntry {
  encounterId: string;
  priority: TriagePriority | null;
  status: string;
  patientReference?: string;
  start?: string;
  outcome?: string;
}

export interface TriageQueueResult {
  date: string;
  total: number;
  entries: TriageQueueEntry[];
}

/** PUT /triage/:encounterId request body. */
export interface UpdateTriageRequest {
  priority?: TriagePriority;
  outcome?: TriageOutcome;
  referralFacility?: string;
}
