import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import type { CarePlan, Encounter } from 'fhir/r4';
import { Role } from '@hphii/fhir-domain';

import { Audit } from '../../core/audit/decorators/audit.decorator';
import { Roles } from '../../core/rbac/decorators/roles.decorator';
import { CreateCarePlanDto } from './dto/create-care-plan.dto';
import { UpdateCarePlanDto } from './dto/update-care-plan.dto';
import { ClosePathwayDto } from './dto/close-pathway.dto';
import { CreateEpisodeDto } from './dto/create-episode.dto';
import { SwitchToChronicDto } from './dto/switch-to-chronic.dto';
import { M3ParcoursService } from './m3-parcours.service';
import type { CarePlanResult, EpisodeResult, PathwayResult } from './m3-parcours.types';

/**
 * M3 — Parcours chronique (M3a) & épisodique (M3b). Guarded globally by
 * JwtAuthGuard → RolesGuard; every mutation is audited. Physician + Nurse run
 * the pathway (§6 "modify clinical record"); closing a plan and converting an
 * episode to chronic are Physician-only.
 *
 * Mutation handlers return the FHIR resource (CarePlan/Encounter) so the audit
 * interceptor anchors the event to the patient via `.subject` when the route
 * carries a resource id rather than a patient id.
 */
@Controller()
export class M3ParcoursController {
  constructor(private readonly parcours: M3ParcoursService) {}

  /* ----- M3a chronic ----- */

  /** Open a chronic care plan. 201 Created. */
  @Post('careplans')
  @Roles(Role.PHYSICIAN, Role.NURSE)
  @Audit('C')
  @HttpCode(HttpStatus.CREATED)
  createCarePlan(@Body() dto: CreateCarePlanDto): Promise<CarePlanResult> {
    return this.parcours.createCarePlan(dto);
  }

  /** Adjust a chronic care plan (title/description/status/activities/goals). */
  @Put('careplans/:carePlanId')
  @Roles(Role.PHYSICIAN, Role.NURSE)
  @Audit('U')
  updateCarePlan(
    @Param('carePlanId') carePlanId: string,
    @Body() dto: UpdateCarePlanDto,
  ): Promise<CarePlan> {
    return this.parcours.updateCarePlan(carePlanId, dto);
  }

  /** Close or cancel a chronic care plan. Physician only (§6 archive/close). */
  @Post('careplans/:carePlanId/close')
  @Roles(Role.PHYSICIAN)
  @Audit('U')
  closeCarePlan(
    @Param('carePlanId') carePlanId: string,
    @Body() dto: ClosePathwayDto,
  ): Promise<CarePlan> {
    return this.parcours.closeCarePlan(carePlanId, dto);
  }

  /** Acknowledge (clear) a pending review marker raised by M4 (HbA1c > 7). */
  @Post('careplans/:carePlanId/review/acknowledge')
  @Roles(Role.PHYSICIAN, Role.NURSE)
  @Audit('U')
  acknowledgeReview(@Param('carePlanId') carePlanId: string): Promise<CarePlan> {
    return this.parcours.acknowledgeReview(carePlanId);
  }

  /* ----- M3b episodic ----- */

  /** Open an acute episode (Encounter + diagnosis Conditions). 201 Created. */
  @Post('episodes')
  @Roles(Role.PHYSICIAN, Role.NURSE)
  @Audit('C')
  @HttpCode(HttpStatus.CREATED)
  createEpisode(@Body() dto: CreateEpisodeDto): Promise<EpisodeResult> {
    return this.parcours.createEpisode(dto);
  }

  /** Close or cancel an episode. */
  @Post('episodes/:episodeId/close')
  @Roles(Role.PHYSICIAN, Role.NURSE)
  @Audit('U')
  closeEpisode(
    @Param('episodeId') episodeId: string,
    @Body() dto: ClosePathwayDto,
  ): Promise<Encounter> {
    return this.parcours.closeEpisode(episodeId, dto);
  }

  /** Convert an episode to a chronic plan. Physician only. 201 Created. */
  @Post('episodes/:episodeId/switch-to-chronic')
  @Roles(Role.PHYSICIAN)
  @Audit('C')
  @HttpCode(HttpStatus.CREATED)
  async switchToChronic(
    @Param('episodeId') episodeId: string,
    @Body() dto: SwitchToChronicDto,
  ): Promise<CarePlan> {
    // Return the CarePlan (not the wrapper) so audit anchors to the patient via
    // CarePlan.subject — the route param is the episode id, not a patient id.
    const result = await this.parcours.switchToChronic(episodeId, dto);
    return result.carePlan;
  }

  /* ----- pathway snapshot ----- */

  /** Chronic/episodic classification + active plan/episode + history for a patient. */
  @Get('patients/:patientId/pathway')
  @Roles(Role.PHYSICIAN, Role.NURSE)
  @Audit('R')
  getPathway(@Param('patientId') patientId: string): Promise<PathwayResult> {
    return this.parcours.getPathway(patientId);
  }
}
