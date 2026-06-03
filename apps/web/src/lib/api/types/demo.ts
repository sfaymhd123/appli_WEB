/** One step of the one-click demo scenario (POST /demo/run). */
export interface DemoStep {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

/** Response of POST /demo/run — the seeded patient + per-step log. */
export interface DemoRunResult {
  ok: boolean;
  patientId: string;
  patientName: string;
  /** The Pending alert left to escalate live (ARCH.md §8); absent if not reached. */
  alertId?: string;
  steps: DemoStep[];
}
