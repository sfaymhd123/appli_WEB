import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import type { DetectedIssue } from 'fhir/r4';
import { Role } from '@hphii/fhir-domain';

import { Audit } from '../../core/audit/decorators/audit.decorator';
import { Roles } from '../../core/rbac/decorators/roles.decorator';
import type { DomainEvent } from '../../core/events';
import { AlertActionDto } from './dto/alert-action.dto';
import { CreateObservationDto } from './dto/create-observation.dto';
import { M4MonitoringService } from './m4-monitoring.service';
import type { AlertsResult, ObservationResult, VitalsTrend } from './m4-monitoring.types';

/**
 * M4 — Monitoring & Alertes. Vitals capture, the §7 threshold engine, and the
 * DetectedIssue acknowledge → resolve lifecycle (ARCH.md §2/§7/§8). Guarded
 * globally by JwtAuthGuard → RolesGuard; clinical reads/writes are audited.
 */

@Controller('observations')
export class M4ObservationsController {
  constructor(private readonly monitoring: M4MonitoringService) {}

  /** Submit a single reading → coded Observation (+ alert if a threshold breaks). */
  @Post()
  @Roles(Role.NURSE, Role.PHYSICIAN)
  @Audit('C')
  @HttpCode(HttpStatus.CREATED)
  createObservation(@Body() dto: CreateObservationDto): Promise<ObservationResult> {
    return this.monitoring.createObservation(dto);
  }
}

@Controller('alerts')
export class M4AlertsController {
  constructor(private readonly monitoring: M4MonitoringService) {}

  /** Active alerts (registered + preliminary), most-recent first. */
  @Get()
  @Roles(Role.NURSE, Role.PHYSICIAN)
  listAlerts(): Promise<AlertsResult> {
    return this.monitoring.listActiveAlerts();
  }

  /** Recent in-app notification events (polling fallback for the SSE stream). */
  @Get('notifications')
  @Roles(Role.NURSE, Role.PHYSICIAN)
  recentNotifications(): DomainEvent[] {
    return this.monitoring.recentNotifications();
  }

  /** Acknowledge an alert → preliminary; cancels the pending escalation timer. */
  @Patch(':alertId/acknowledge')
  @Roles(Role.NURSE, Role.PHYSICIAN)
  @Audit('U')
  acknowledge(
    @Param('alertId') alertId: string,
    @Body() dto: AlertActionDto,
  ): Promise<DetectedIssue> {
    return this.monitoring.acknowledgeAlert(alertId, dto);
  }

  /** Resolve an alert → final. */
  @Patch(':alertId/resolve')
  @Roles(Role.NURSE, Role.PHYSICIAN)
  @Audit('U')
  resolve(
    @Param('alertId') alertId: string,
    @Body() dto: AlertActionDto,
  ): Promise<DetectedIssue> {
    return this.monitoring.resolveAlert(alertId, dto);
  }
}

@Controller('patients/:patientId/vitals')
export class M4VitalsController {
  constructor(private readonly monitoring: M4MonitoringService) {}

  /** Per-metric vitals time series for the trend chart. */
  @Get()
  @Roles(Role.NURSE, Role.PHYSICIAN)
  @Audit('R')
  vitals(@Param('patientId') patientId: string): Promise<VitalsTrend> {
    return this.monitoring.getVitalsTrend(patientId);
  }
}
