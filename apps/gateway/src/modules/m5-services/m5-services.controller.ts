import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { MedicationRequest, ServiceRequest } from 'fhir/r4';
import { Role } from '@hphii/fhir-domain';

import { Audit } from '../../core/audit/decorators/audit.decorator';
import { Roles } from '../../core/rbac/decorators/roles.decorator';
import type { DomainEvent } from '../../core/events';
import { CreateDiagnosticReportDto } from './dto/create-diagnostic-report.dto';
import { CreateMedicationRequestDto } from './dto/create-medication-request.dto';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { ValidatePrescriptionDto } from './dto/validate-prescription.dto';
import { M5ServicesService } from './m5-services.service';
import type {
  DiagnosticReportListResult,
  DiagnosticReportResult,
  MedicationOrderResult,
  PrescriptionListResult,
  ServiceOrderListResult,
} from './m5-services.types';

/**
 * M5 — Services médico-techniques: pharmacy, laboratory, imaging (CLAUDE.md
 * §2/§6). Guarded globally by JwtAuthGuard → RolesGuard; clinical writes and
 * patient-specific actions are audited (ATNA).
 *
 * RBAC (§6): only Physician orders meds/studies; Physician/Pharmacist validate
 * prescriptions; only Lab-Technician adds biological results. Mutations use
 * specific route params and return FHIR resources / patient-carrying bodies so
 * the AuditInterceptor can anchor each AuditEvent to the patient.
 */
@Controller()
export class M5ServicesController {
  constructor(private readonly services: M5ServicesService) {}

  /* ----- Pharmacy ----- */

  /** Order a medication → draft MedicationRequest (+ simulated stock). */
  @Post('medication-requests')
  @Roles(Role.PHYSICIAN)
  @Audit('C')
  @HttpCode(HttpStatus.CREATED)
  createMedicationRequest(
    @Body() dto: CreateMedicationRequestDto,
  ): Promise<MedicationOrderResult> {
    return this.services.createMedicationRequest(dto);
  }

  /** Validate (approve) or reject a draft prescription (§6: Physician/Pharmacist). */
  @Post('medication-requests/:medicationRequestId/validate')
  @Roles(Role.PHYSICIAN, Role.PHARMACIST)
  @Audit('U')
  validatePrescription(
    @Param('medicationRequestId') medicationRequestId: string,
    @Body() dto: ValidatePrescriptionDto,
  ): Promise<MedicationRequest> {
    return this.services.validatePrescription(medicationRequestId, dto);
  }

  /** List prescriptions; `?status=draft` drives the pharmacist validation queue. */
  @Get('medication-requests')
  @Roles(Role.PHYSICIAN, Role.PHARMACIST)
  listPrescriptions(@Query('status') status?: string): Promise<PrescriptionListResult> {
    return this.services.listPrescriptions(status);
  }

  /* ----- Laboratory & imaging orders ----- */

  /** Order a laboratory or imaging study → active ServiceRequest. */
  @Post('service-requests')
  @Roles(Role.PHYSICIAN)
  @Audit('C')
  @HttpCode(HttpStatus.CREATED)
  createServiceRequest(@Body() dto: CreateServiceRequestDto): Promise<ServiceRequest> {
    return this.services.createServiceRequest(dto);
  }

  /** List service orders; `?status=active` drives the lab technician worklist. */
  @Get('service-requests')
  @Roles(Role.PHYSICIAN, Role.LAB_TECHNICIAN)
  listServiceRequests(@Query('status') status?: string): Promise<ServiceOrderListResult> {
    return this.services.listServiceRequests(status);
  }

  /* ----- Results ----- */

  /** Record a result → Observation + DiagnosticReport (§6: Lab-Technician only). */
  @Post('diagnostic-reports')
  @Roles(Role.LAB_TECHNICIAN)
  @Audit('C')
  @HttpCode(HttpStatus.CREATED)
  createDiagnosticReport(
    @Body() dto: CreateDiagnosticReportDto,
  ): Promise<DiagnosticReportResult> {
    return this.services.createDiagnosticReport(dto);
  }

  /** List diagnostic reports (most-recent first). */
  @Get('diagnostic-reports')
  @Roles(Role.PHYSICIAN, Role.LAB_TECHNICIAN)
  listDiagnosticReports(): Promise<DiagnosticReportListResult> {
    return this.services.listDiagnosticReports();
  }

  /** Recent abnormal-result events for the ordering physician (polling fallback). */
  @Get('services/notifications')
  @Roles(Role.PHYSICIAN)
  recentNotifications(): DomainEvent[] {
    return this.services.recentAbnormalNotifications();
  }
}
