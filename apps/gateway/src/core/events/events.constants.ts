/**
 * Event/queue identifiers and payload shapes for M4's escalation pipeline
 * (CLAUDE.md §8 — the 15-minute alert timer is the project's flagship feature).
 */

/** BullMQ queue carrying the delayed "escalate this alert" jobs. */
export const ALERT_ESCALATION_QUEUE = 'alert-escalation';

/** Job name within {@link ALERT_ESCALATION_QUEUE}. */
export const ESCALATION_JOB = 'escalate-alert';

/** Payload of an escalation job. PHI-safe: a logical id only, never vitals. */
export interface EscalationJobData {
  detectedIssueId: string;
}

/** Domain event kinds emitted on the in-app channel (consumed via SSE). */
export type DomainEventKind =
  | 'alert.created'
  | 'alert.acknowledged'
  | 'alert.resolved'
  | 'alert.escalated'
  | 'careplan.review-needed'
  // M5 — an abnormal DiagnosticReport notifies the ordering physician (§2).
  | 'result.abnormal';

/**
 * A single in-app domain event. PHI-safe by contract: it carries resource
 * references (types + logical ids) and a severity, never patient identifiers
 * or measured values (CLAUDE.md §9).
 */
export interface DomainEvent {
  kind: DomainEventKind;
  /** ISO-8601 instant the event was emitted. */
  at: string;
  /** DetectedIssue logical id when the event concerns an alert. */
  detectedIssueId?: string;
  /** DiagnosticReport logical id when the event concerns a lab/imaging result. */
  diagnosticReportId?: string;
  /** Patient reference, e.g. "Patient/123". */
  patient?: string;
  /** DetectedIssue severity (high/moderate/low) when relevant. */
  severity?: string;
  /** Whether the front-end should surface this prominently (escalations). */
  urgent?: boolean;
  /** Short, PHI-safe French label for display. */
  message: string;
}
