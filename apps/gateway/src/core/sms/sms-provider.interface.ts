/** A single outbound SMS. `to` is the destination; `body` is plain text. */
export interface SmsMessage {
  to: string;
  body: string;
}

/** Result of a send attempt. */
export interface SmsSendResult {
  /** Name of the provider that handled the send (e.g. "console", "twilio"). */
  provider: string;
  to: string;
  accepted: boolean;
  /** Provider-side reference when available (e.g. a Twilio message SID). */
  reference?: string;
}

/**
 * Pluggable SMS transport (ARCH.md §3). The default ConsoleSmsProvider logs;
 * a Twilio adapter can be added without touching callers. Never hard-code a
 * provider at a call site — always depend on this interface.
 */
export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SmsSendResult>;
}
