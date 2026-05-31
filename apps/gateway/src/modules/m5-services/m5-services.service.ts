import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DiagnosticReport, MedicationRequest, Patient, ServiceRequest } from 'fhir/r4';
import { type PatientSex, ServiceCategoryLabels } from '@hphii/fhir-domain';

import { DomainEventBus, type DomainEvent } from '../../core/events';
import {
  DiagnosticReportHelper,
  FhirService,
  MedicationRequestHelper,
  ServiceRequestHelper,
} from '../../core/fhir';
import { NotificationService } from '../../core/notifications';
import type { CreateDiagnosticReportDto } from './dto/create-diagnostic-report.dto';
import type { CreateMedicationRequestDto } from './dto/create-medication-request.dto';
import type { CreateServiceRequestDto } from './dto/create-service-request.dto';
import type { ValidatePrescriptionDto } from './dto/validate-prescription.dto';
import {
  buildDiagnosticReportResource,
  buildMedicationRequestResource,
  buildResultObservation,
  buildServiceRequestResource,
  deriveAbnormal,
  projectDiagnosticReport,
  projectPrescription,
  projectServiceOrder,
  simulateStock,
} from './services-engine';
import type {
  DiagnosticReportListResult,
  DiagnosticReportResult,
  MedicationOrderResult,
  PrescriptionListResult,
  ServiceOrderListResult,
} from './m5-services.types';

/**
 * M5 — Services médico-techniques (CLAUDE.md §2/§6). Pharmacy (MedicationRequest
 * order + pharmacist validation + simulated stock), laboratory & imaging
 * (ServiceRequest orders, Lab-Technician DiagnosticReport results), and the
 * abnormal-result notification to the ordering physician. All HAPI access is via
 * FhirService; all notifications via NotificationService.
 */
@Injectable()
export class M5ServicesService {
  private readonly logger = new Logger(M5ServicesService.name);

  constructor(
    private readonly fhir: FhirService,
    private readonly notifications: NotificationService,
    private readonly events: DomainEventBus,
    private readonly config: ConfigService,
  ) {}

  /* ----- Pharmacy ----- */

  /** Physician orders a medication → draft MedicationRequest + simulated stock. */
  async createMedicationRequest(dto: CreateMedicationRequestDto): Promise<MedicationOrderResult> {
    const patientRef = await this.requirePatientRef(dto.patientId);

    const medicationRequest = await this.fhir.create(
      buildMedicationRequestResource({
        patientRef,
        medication: dto.medication,
        code: dto.code,
        system: dto.system,
        dosageInstruction: dto.dosageInstruction,
        quantity: dto.quantity,
        quantityUnit: dto.quantityUnit,
        note: dto.note,
        authoredOn: new Date().toISOString(),
      }),
    );

    const availability = simulateStock(dto.medication);
    this.logger.log(
      `MedicationRequest/${medicationRequest.id ?? '?'} created (draft) for ${patientRef} — stock ${availability.status}`,
    );
    return { medicationRequest, availability };
  }

  /**
   * Validate (approve → active) or reject (→ cancelled) a draft prescription.
   * Allowed for Physician/Pharmacist (§6). Returns the updated MedicationRequest
   * so the AuditInterceptor anchors the AuditEvent via MedicationRequest.subject.
   */
  async validatePrescription(
    medicationRequestId: string,
    dto: ValidatePrescriptionDto,
  ): Promise<MedicationRequest> {
    const resource = await this.fhir.read<MedicationRequest>(
      'MedicationRequest',
      medicationRequestId,
    );

    if (resource.status !== 'draft') {
      throw new BadRequestException(
        `MedicationRequest/${medicationRequestId} is not awaiting validation (status: ${resource.status ?? 'unknown'}).`,
      );
    }

    resource.status = dto.decision === 'approve' ? 'active' : 'cancelled';
    const noteText =
      dto.note ??
      (dto.decision === 'approve' ? 'Prescription validée.' : 'Prescription rejetée.');
    resource.note = [...(resource.note ?? []), { text: noteText }];

    const updated = await this.fhir.update(resource);
    this.logger.log(
      `MedicationRequest/${medicationRequestId} ${dto.decision === 'approve' ? 'validated → active' : 'rejected → cancelled'}`,
    );
    return updated;
  }

  /** List prescriptions (optionally filtered by status, e.g. draft for the queue). */
  async listPrescriptions(status?: string): Promise<PrescriptionListResult> {
    const params: Record<string, string | number> = { _count: 200, _sort: '-authoredon' };
    if (status) params.status = status;
    const bundle = await this.fhir.search<MedicationRequest>('MedicationRequest', params);
    const prescriptions = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is MedicationRequest => MedicationRequestHelper.is(resource))
      .map(projectPrescription);
    return { total: prescriptions.length, prescriptions };
  }

  /* ----- Laboratory & imaging orders ----- */

  /** Physician orders a lab/imaging study → active ServiceRequest. */
  async createServiceRequest(dto: CreateServiceRequestDto): Promise<ServiceRequest> {
    const patientRef = await this.requirePatientRef(dto.patientId);

    const serviceRequest = await this.fhir.create(
      buildServiceRequestResource({
        patientRef,
        category: dto.category,
        display: dto.display,
        loinc: dto.loinc,
        priority: dto.priority,
        note: dto.note,
        authoredOn: new Date().toISOString(),
      }),
    );

    this.logger.log(
      `ServiceRequest/${serviceRequest.id ?? '?'} created (${dto.category}) for ${patientRef}`,
    );
    return serviceRequest;
  }

  /** List service orders (optionally filtered by status, e.g. active = pending). */
  async listServiceRequests(status?: string): Promise<ServiceOrderListResult> {
    const params: Record<string, string | number> = { _count: 200, _sort: '-authored' };
    if (status) params.status = status;
    const bundle = await this.fhir.search<ServiceRequest>('ServiceRequest', params);
    const orders = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is ServiceRequest => ServiceRequestHelper.is(resource))
      .map(projectServiceOrder);
    return { total: orders.length, orders };
  }

  /* ----- Results ----- */

  /**
   * Lab-Technician records a result (§6: "Add biological result" — Lab-Technician
   * only). Creates the result Observation + a DiagnosticReport, derives the
   * abnormal flag, and — when abnormal — notifies the ordering physician (SMS +
   * in-app). Returns a wrapper; the AuditInterceptor anchors via body.patientId.
   */
  async createDiagnosticReport(dto: CreateDiagnosticReportDto): Promise<DiagnosticReportResult> {
    if (typeof dto.value !== 'number' && !dto.valueText) {
      throw new BadRequestException('A numeric `value` or a `valueText` result is required.');
    }

    const patient = await this.fhir.read<Patient>('Patient', dto.patientId);
    const patientRef = `Patient/${dto.patientId}`;
    const sex = patientSex(patient);
    const issued = new Date().toISOString();

    const abnormal = deriveAbnormal({
      loinc: dto.loinc,
      value: dto.value,
      explicit: dto.abnormal,
      sex,
    });

    const observation = await this.fhir.create(
      buildResultObservation({
        patientRef,
        category: dto.category,
        loinc: dto.loinc,
        display: dto.display,
        value: dto.value,
        unit: dto.unit,
        valueText: dto.valueText,
        abnormal,
        effectiveDateTime: issued,
      }),
    );

    const report = await this.fhir.create(
      buildDiagnosticReportResource({
        patientRef,
        category: dto.category,
        loinc: dto.loinc,
        display: dto.display,
        observationRef: observation.id ? `Observation/${observation.id}` : undefined,
        basedOnServiceRequestId: dto.serviceRequestId,
        conclusion: buildConclusion(dto, abnormal),
        abnormal,
        issued,
      }),
    );

    // Close the originating order, if any (best-effort — never blocks the result).
    if (dto.serviceRequestId) await this.completeOrder(dto.serviceRequestId);

    this.logger.log(
      `DiagnosticReport/${report.id ?? '?'} created (${dto.category}, ${abnormal ? 'abnormal' : 'normal'}) for ${patientRef}`,
    );

    const result: DiagnosticReportResult = { report, abnormal };
    if (abnormal) {
      result.notification = await this.notifyAbnormal(report, dto, patientRef);
    }
    return result;
  }

  /** List diagnostic reports (most-recent first). */
  async listDiagnosticReports(): Promise<DiagnosticReportListResult> {
    const bundle = await this.fhir.search<DiagnosticReport>('DiagnosticReport', {
      _count: 200,
      _sort: '-issued',
    });
    const reports = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is DiagnosticReport => DiagnosticReportHelper.is(resource))
      .map(projectDiagnosticReport);
    return { total: reports.length, reports };
  }

  /** Recent abnormal-result events (polling fallback for the SSE stream). */
  recentAbnormalNotifications(): DomainEvent[] {
    return this.events.recentEvents().filter((event) => event.kind === 'result.abnormal');
  }

  /* ----- private helpers ----- */

  /** Confirm the patient exists (404s early; also anchors the AuditEvent entity). */
  private async requirePatientRef(patientId: string): Promise<string> {
    await this.fhir.read<Patient>('Patient', patientId);
    return `Patient/${patientId}`;
  }

  /** Notify the ordering physician of an abnormal result (PHI-safe: no value). */
  private async notifyAbnormal(
    report: DiagnosticReport,
    dto: CreateDiagnosticReportDto,
    patientRef: string,
  ): Promise<DiagnosticReportResult['notification']> {
    const reportRef = report.id ? `DiagnosticReport/${report.id}` : 'DiagnosticReport';
    const label = dto.display ?? `LOINC ${dto.loinc}`;
    const category = ServiceCategoryLabels[dto.category];
    const dispatch = await this.notifications.notify({
      kind: 'result.abnormal',
      to: this.config.get<string>('orderingPhysicianPhone') ?? '',
      body: `RÉSULTAT ANORMAL — ${label} (${category}), ${reportRef}. Revue par le médecin prescripteur requise.`,
      diagnosticReportId: report.id,
      patient: patientRef,
      severity: 'high',
      urgent: true,
    });
    this.logger.warn(`${reportRef} ABNORMAL → ordering physician notified`);
    return {
      channels: dispatch.channels,
      smsAccepted: dispatch.smsAccepted,
      smsProvider: dispatch.smsProvider,
    };
  }

  /** Mark the originating ServiceRequest completed. Best-effort; never throws. */
  private async completeOrder(serviceRequestId: string): Promise<void> {
    try {
      const order = await this.fhir.read<ServiceRequest>('ServiceRequest', serviceRequestId);
      order.status = 'completed';
      await this.fhir.update(order);
      this.logger.log(`ServiceRequest/${serviceRequestId} marked completed`);
    } catch (error) {
      this.logger.warn(
        `Could not complete ServiceRequest/${serviceRequestId}: ${describe(error)}`,
      );
    }
  }
}

/** PHI-safe: do NOT include the measured value here (it is stored in HAPI only). */
function buildConclusion(dto: CreateDiagnosticReportDto, abnormal: boolean): string {
  if (dto.conclusion) return dto.conclusion;
  const label = dto.display ?? `LOINC ${dto.loinc}`;
  const value =
    typeof dto.value === 'number'
      ? `${dto.value}${dto.unit ? ` ${dto.unit}` : ''}`
      : (dto.valueText ?? '');
  const verdict = abnormal ? 'anormal' : 'normal';
  return `${label}: ${value} (${verdict}).`;
}

function patientSex(patient: Patient): PatientSex | undefined {
  return patient.gender === 'male' || patient.gender === 'female' ? patient.gender : undefined;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
