import type { DomainEventKind } from '../events';

/**
 * A clinician-facing notification to fan out across channels (SMS now; in-app
 * via SSE). PHI-safe by contract: `body`/metadata carry resource references and
 * severity only — never patient identifiers or measured values (CLAUDE.md §9).
 */
export interface ClinicalNotification {
  /** Domain event kind this notification corresponds to. */
  kind: DomainEventKind;
  /** SMS destination (E.164). Empty string → SMS channel is skipped. */
  to: string;
  /** PHI-safe message body. */
  body: string;
  /** DetectedIssue logical id, for the in-app event. */
  detectedIssueId?: string;
  /** Patient reference, e.g. "Patient/123". */
  patient?: string;
  /** Severity (high/moderate/low). */
  severity?: string;
  /** Mark as urgent (escalations) so the UI can surface it prominently. */
  urgent?: boolean;
}

/** Outcome of delivering to a single channel. */
export interface ChannelResult {
  channel: string;
  ok: boolean;
  /** Underlying provider name for the SMS channel (e.g. "console"). */
  provider?: string;
}

/** Aggregated outcome of a multi-channel dispatch. */
export interface NotificationDispatchResult {
  /** Names of the channels that accepted the notification. */
  channels: string[];
  smsAccepted: boolean;
  smsProvider?: string;
}
