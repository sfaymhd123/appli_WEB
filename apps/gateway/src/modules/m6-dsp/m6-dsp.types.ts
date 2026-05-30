import type { FilteredResourceType, Role } from '@hphii/fhir-domain';

/** One row of the patient's AuditEvent trail (PHI-safe projection). */
export interface DspAuditEntry {
  /** AuditEvent logical id. */
  id?: string;
  /** FHIR AuditEvent.action: C / R / U / D / E. */
  action?: string;
  /** ISO instant the event was recorded. */
  recorded?: string;
  /** Actor role (from agent.type.coding) — e.g. "Physician". */
  actorRole?: string;
  /** Actor gateway id (JWT sub) — never a patient identifier. */
  actorId?: string;
  /** FHIR AuditEvent.outcome: 0 / 4 / 8 / 12. */
  outcome?: string;
  /** Audited entity reference, e.g. "Patient/123". */
  entity?: string;
}

/** GET /dsp/:patientId/audit response. */
export interface DspAuditTrail {
  patientId: string;
  total: number;
  events: DspAuditEntry[];
}

/** Per-role filtering metadata echoed alongside the role-filtered Bundle. */
export interface DspFilterInfo {
  role: Role;
  allowed: readonly FilteredResourceType[];
}
