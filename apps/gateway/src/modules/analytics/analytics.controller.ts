import { Controller, Get, Req } from '@nestjs/common';
import { Role } from '@hphii/fhir-domain';

import { Roles } from '../../core/rbac/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';
import type { KpiReport } from './analytics.types';
import type { AuthenticatedRequest } from '../../core/auth/auth.types';

/**
 * Analytics — balanced-scorecard KPIs (ARCH.md report metrics). Guarded
 * globally by JwtAuthGuard → RolesGuard; restricted to Admin + Physician.
 *
 * `GET /kpis` is an aggregate, non-patient-specific read, so it is intentionally
 * NOT decorated with @Audit (the ATNA trail covers per-patient DSP access only).
 */
@Controller('kpis')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Balanced-scorecard KPIs, computed live from FHIR (seed fallback). */
  @Get()
  @Roles(Role.ADMIN, Role.PHYSICIAN, Role.NURSE, Role.PHARMACIST, Role.LAB_TECHNICIAN)
  getKpis(@Req() req: AuthenticatedRequest): Promise<KpiReport> {
    return this.analytics.getKpis(req.user.role, req.user.sub);
  }
}
