import type { DiagnosticReport, MedicationRequest, ServiceRequest } from 'fhir/r4';
import type { ServiceCategory, StockStatus } from '@hphii/fhir-domain';

/** Channels a notification reached (mirrors NotificationDispatchResult). */
export interface NotificationOutcome {
  channels: string[];
  smsAccepted: boolean;
  smsProvider?: string;
}

/**
 * Simulated pharmacy availability for a medication (PoC — deterministic from the
 * medication label; there is no real inventory system).
 */
export interface StockAvailability {
  status: StockStatus;
  /** Simulated units on hand. */
  onHand: number;
  /** Convenience flag — true unless out-of-stock. */
  available: boolean;
}

/** PHI-light projection of a MedicationRequest for the pharmacy queues. */
export interface PrescriptionSummary {
  id: string;
  patientReference?: string;
  patientName?: string;
  /** FHIR MedicationRequest.status (draft → active | cancelled). */
  status: string;
  intent?: string;
  priority?: string;
  /** Medication display text. */
  medication: string;
  dosageInstruction?: string;
  quantity?: number;
  quantityUnit?: string;
  note?: string;
  authoredOn?: string;
  /** Simulated stock availability (computed, not stored in HAPI). */
  availability: StockAvailability;
}

export interface PrescriptionListResult {
  total: number;
  prescriptions: PrescriptionSummary[];
}

/** Result of ordering a medication: the resource + simulated availability. */
export interface MedicationOrderResult {
  medicationRequest: MedicationRequest;
  availability: StockAvailability;
}

/** PHI-light projection of a ServiceRequest (lab/imaging order). */
export interface ServiceOrderSummary {
  id: string;
  patientReference?: string;
  patientName?: string;
  /** FHIR ServiceRequest.status (active → completed | revoked). */
  status: string;
  category?: ServiceCategory;
  /** Requested study display text. */
  display: string;
  loinc?: string;
  priority?: string;
  note?: string;
  authoredOn?: string;
}

export interface ServiceOrderListResult {
  total: number;
  orders: ServiceOrderSummary[];
}

/** PHI-light projection of a DiagnosticReport (lab/imaging result). */
export interface DiagnosticReportSummary {
  id: string;
  patientReference?: string;
  patientName?: string;
  status: string;
  category?: ServiceCategory;
  loinc?: string;
  label?: string;
  /** Narrative conclusion (includes the measured value/unit). */
  conclusion?: string;
  /** Overall abnormal/normal interpretation (result-interpretation extension). */
  abnormal: boolean;
  issued?: string;
  /** Originating ServiceRequest id, when the report was based on an order. */
  basedOnServiceRequestId?: string;
}

export interface DiagnosticReportListResult {
  total: number;
  reports: DiagnosticReportSummary[];
}

/** Result of recording a DiagnosticReport (with the abnormal-result notification). */
export interface DiagnosticReportResult {
  report: DiagnosticReport;
  abnormal: boolean;
  /** Present when an abnormal result notified the ordering physician. */
  notification?: NotificationOutcome;
}

/** Re-export — validate returns the raw resource so the audit anchors via subject. */
export type PrescriptionResource = MedicationRequest;
export type ServiceOrderResource = ServiceRequest;
