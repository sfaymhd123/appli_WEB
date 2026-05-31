import { Module } from '@nestjs/common';

import { FhirModule } from '../../core/fhir';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

/**
 * Analytics — balanced-scorecard KPI dashboard (CLAUDE.md report metrics).
 * FhirModule provides the FhirService for all live aggregation; the seed
 * fallback (`docs/kpis.json`) is read directly from disk.
 */
@Module({
  imports: [FhirModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
