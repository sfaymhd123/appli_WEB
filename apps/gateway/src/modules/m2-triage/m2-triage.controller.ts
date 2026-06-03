import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import type { Encounter } from 'fhir/r4';
import { Role } from '@hphii/fhir-domain';

import { Audit } from '../../core/audit/decorators/audit.decorator';
import { Roles } from '../../core/rbac/decorators/roles.decorator';
import { CreateTriageDto } from './dto/create-triage.dto';
import { UpdateTriageDto } from './dto/update-triage.dto';
import { M2TriageService } from './m2-triage.service';
import type { TriageQueueResult, TriageResponse } from './m2-triage.types';

/**
 * M2 — Triage. Algorithmic priority assignment (P1..P5) → Encounter + Task,
 * with a P1 auto-alert. Guarded globally by JwtAuthGuard → RolesGuard; triage
 * actions are audited. Nurses triage; physicians validate/override (§6).
 */
@Controller('triage')
export class M2TriageController {
  constructor(private readonly triage: M2TriageService) {}

  /** Run triage → Encounter + Task (+ P1 critical alert). 201 Created. */
  @Post()
  @Roles(Role.NURSE, Role.PHYSICIAN, Role.ADMIN)
  @Audit('C')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTriageDto): Promise<TriageResponse> {
    return this.triage.triage(dto);
  }

  /** Today's triage queue, most-urgent first. */
  @Get('queue')
  @Roles(Role.NURSE, Role.PHYSICIAN)
  queue(): Promise<TriageQueueResult> {
    return this.triage.queueToday();
  }

  /** Validate/override priority or record an outcome. Physician only (§6). */
  @Put(':encounterId')
  @Roles(Role.PHYSICIAN)
  @Audit('U')
  update(
    @Param('encounterId') encounterId: string,
    @Body() dto: UpdateTriageDto,
  ): Promise<Encounter> {
    return this.triage.updateTriage(encounterId, dto);
  }
}
