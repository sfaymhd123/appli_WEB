import type { DiagnosticReport, MedicationRequest } from 'fhir/r4';
import type { ServiceCategory, StockStatus } from '@hphii/fhir-domain';

/* ----- projections (mirror apps/gateway m5-services.types.ts) ----- */

export interface NotificationOutcome {
  channels: string[];
  smsAccepted: boolean;
  smsProvider?: string;
}

export interface StockAvailability {
  status: StockStatus;
  onHand: number;
  available: boolean;
}

export interface PrescriptionSummary {
  id: string;
  patientReference?: string;
  status: string;
  intent?: string;
  medication: string;
  dosageInstruction?: string;
  quantity?: number;
  quantityUnit?: string;
  note?: string;
  authoredOn?: string;
  availability: StockAvailability;
}

export interface PrescriptionListResult {
  total: number;
  prescriptions: PrescriptionSummary[];
}

export interface MedicationOrderResult {
  medicationRequest: MedicationRequest;
  availability: StockAvailability;
}

export interface ServiceOrderSummary {
  id: string;
  patientReference?: string;
  status: string;
  category?: ServiceCategory;
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

export interface DiagnosticReportSummary {
  id: string;
  patientReference?: string;
  status: string;
  category?: ServiceCategory;
  loinc?: string;
  label?: string;
  conclusion?: string;
  abnormal: boolean;
  issued?: string;
  basedOnServiceRequestId?: string;
}

export interface DiagnosticReportListResult {
  total: number;
  reports: DiagnosticReportSummary[];
}

export interface DiagnosticReportResult {
  report: DiagnosticReport;
  abnormal: boolean;
  notification?: NotificationOutcome;
}

/** An abnormal-result event from GET /services/notifications (mirrors DomainEvent). */
export interface ServiceNotificationEvent {
  kind: string;
  at: string;
  diagnosticReportId?: string;
  patient?: string;
  severity?: string;
  urgent?: boolean;
  message: string;
}

/* ----- request bodies (mirror the M5 DTOs) ----- */

/** POST /medication-requests */
export interface CreateMedicationRequestRequest {
  patientId: string;
  medication: string;
  code?: string;
  system?: string;
  dosageInstruction: string;
  quantity?: number;
  quantityUnit?: string;
  note?: string;
}

/** POST /medication-requests/:id/validate */
export interface ValidatePrescriptionRequest {
  decision: 'approve' | 'reject';
  note?: string;
}

/** POST /service-requests */
export interface CreateServiceRequestRequest {
  patientId: string;
  category: ServiceCategory;
  display: string;
  loinc?: string;
  priority?: 'routine' | 'urgent' | 'asap' | 'stat';
  note?: string;
}

/** POST /diagnostic-reports */
export interface CreateDiagnosticReportRequest {
  patientId: string;
  serviceRequestId?: string;
  category: ServiceCategory;
  loinc: string;
  display?: string;
  value?: number;
  unit?: string;
  valueText?: string;
  abnormal?: boolean;
  conclusion?: string;
}
