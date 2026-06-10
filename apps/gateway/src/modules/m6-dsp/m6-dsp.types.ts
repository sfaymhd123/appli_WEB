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

/** One row of the global documents register. */
export interface DspDocumentSummary {
  id?: string;
  date?: string;
  title: string;
  description?: string;
  patientReference?: string;
  patientId?: string;
  patientName: string;
  patientMrn?: string;
  type: string;
  status?: string;
  contentData?: string;
}

/** GET /dsp/documents response. */
export interface DspDocumentList {
  total: number;
  documents: DspDocumentSummary[];
}

/** Per-role filtering metadata echoed alongside the role-filtered Bundle. */
export interface DspFilterInfo {
  role: Role;
  allowed: readonly FilteredResourceType[];
}
