/** Mirror of the gateway M6 DSP response/request shapes. */

/** One row of the patient's AuditEvent trail (PHI-safe projection). */
export interface DspAuditEntry {
  id?: string;
  /** FHIR AuditEvent.action: C / R / U / D / E. */
  action?: string;
  recorded?: string;
  actorRole?: string;
  actorId?: string;
  outcome?: string;
  entity?: string;
}

/** GET /dsp/:patientId/audit response. */
export interface DspAuditTrail {
  patientId: string;
  total: number;
  events: DspAuditEntry[];
}

/** POST /dsp/:patientId/documents request body. */
export interface CreateDocumentRequest {
  title?: string;
  description?: string;
  contentText?: string;
}
