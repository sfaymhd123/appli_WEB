import type { Observation } from 'fhir/r4';

/** Channels a reading can arrive through (mirrors the gateway SOURCES union). */
export type ObservationSource = 'sms' | 'app' | 'device';

/** POST /observations request body (mirrors the gateway CreateObservationDto). */
export interface CreateObservationRequest {
  patientId: string;
  /** A §7 metric key, e.g. "systolic-bp". */
  metric: string;
  value: number;
  source?: ObservationSource;
  effectiveDateTime?: string;
}

/** PHI-light projection of a DetectedIssue alert (mirrors gateway AlertSummary). */
export interface AlertSummary {
  id: string;
  patientReference?: string;
  severity?: string;
  /** FHIR DetectedIssue.status: registered → preliminary → final. */
  status: string;
  /** acknowledgement-status extension: Pending / Acknowledged / Escalated. */
  acknowledgement: string;
  detail?: string;
  identifiedDateTime?: string;
  /** Minutes allowed before escalation. */
  escalationMinutes?: number;
  source?: string;
}

export interface AlertsResult {
  total: number;
  alerts: AlertSummary[];
}

/** Channels an alert notification reached. */
export interface NotificationDispatch {
  channels: string[];
  smsAccepted: boolean;
  smsProvider?: string;
}

/** Result of submitting a reading (with any triggered alert). */
export interface ObservationResult {
  observation: Observation;
  breached: boolean;
  severity: string | null;
  alert?: AlertSummary;
  /** True when the value triggered a CarePlan-review event (HbA1c > 7). */
  careplanReview?: boolean;
  notification?: NotificationDispatch;
}

export interface VitalsPoint {
  at: string;
  value: number;
}

export interface VitalsSeries {
  metric: string;
  loinc: string;
  label: string;
  unit: string;
  points: VitalsPoint[];
}

export interface VitalsTrend {
  patientId: string;
  series: VitalsSeries[];
}

/** In-app domain events streamed over SSE / polled from /alerts/notifications. */
export type AlertEventKind =
  | 'alert.created'
  | 'alert.acknowledged'
  | 'alert.resolved'
  | 'alert.escalated'
  | 'careplan.review-needed';

export interface AlertStreamEvent {
  kind: AlertEventKind;
  at: string;
  detectedIssueId?: string;
  patient?: string;
  severity?: string;
  urgent?: boolean;
  message: string;
}
