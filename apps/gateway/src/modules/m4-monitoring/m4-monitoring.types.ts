import type { DetectedIssue, Observation } from 'fhir/r4';

/** A PHI-light projection of a DetectedIssue alert for the dashboard. */
export interface AlertSummary {
  id: string;
  patientReference?: string;
  severity?: string;
  /** FHIR DetectedIssue.status (registered → preliminary → final). */
  status: string;
  /** acknowledgement-status extension (Pending / Acknowledged / Escalated). */
  acknowledgement: string;
  detail?: string;
  identifiedDateTime?: string;
  /** Minutes allowed before escalation (escalation-timer-minutes extension). */
  escalationMinutes?: number;
  /** alert-source extension (e.g. "M4-Monitoring", "M2-Triage"). */
  source?: string;
}

export interface AlertsResult {
  total: number;
  alerts: AlertSummary[];
}

/** Result of submitting an observation (with any triggered alert). */
export interface ObservationResult {
  observation: Observation;
  breached: boolean;
  severity: string | null;
  /** Present when a DetectedIssue alert was raised. */
  alert?: AlertSummary;
  /** True when the value triggered a CarePlan-review event (HbA1c > 7). */
  careplanReview?: boolean;
  /** Channels the alert notification reached. */
  notification?: {
    channels: string[];
    smsAccepted: boolean;
    smsProvider?: string;
  };
}

export interface VitalsPoint {
  at: string;
  value: number;
}

export interface VitalsSeries {
  /** Spec key, e.g. "systolic-bp". */
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

/** Re-export of a DetectedIssue, returned by acknowledge/resolve (audit anchor). */
export type AlertResource = DetectedIssue;
