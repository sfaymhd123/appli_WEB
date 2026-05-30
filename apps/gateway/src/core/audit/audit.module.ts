import { Module } from '@nestjs/common';

import { FhirModule } from '../fhir/fhir.module';
import { AuditService } from './audit.service';

/**
 * ATNA audit. AuditService posts AuditEvents to HAPI (via FhirService) and
 * mirrors them locally. The global AuditInterceptor is registered in AppModule.
 */
@Module({
  imports: [FhirModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
