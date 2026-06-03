/** One labelled step of the demo scenario, with its success/failure outcome. */
export interface DemoStep {
  /** Stable machine key (e.g. "triage"). */
  key: string;
  /** Human label (French — surfaced in the UI). */
  label: string;
  ok: boolean;
  /** Failure detail (only when ok === false). */
  detail?: string;
}

/** Result of POST /demo/run — the seeded patient plus a per-step log. */
export interface DemoRunResult {
  ok: boolean;
  /** Logical id of the patient the scenario created (FHIR Patient/{id}). */
  patientId: string;
  /** Display name of the seeded patient (PoC demo data). */
  patientName: string;
  /**
   * The breaching-observation DetectedIssue left **Pending**: it is the alert the
   * 15-min timer escalates live on camera (ARCH.md §8). Undefined if that step
   * did not run.
   */
  alertId?: string;
  steps: DemoStep[];
}
