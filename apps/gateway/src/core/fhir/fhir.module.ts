import { Module } from '@nestjs/common';

import { fhirHttpProvider } from './fhir-http.provider';
import { FhirMetadataController } from './fhir-metadata.controller';
import { FhirService } from './fhir.service';

/** Core FHIR layer — the gateway's single door to HAPI (CLAUDE.md §9). */
@Module({
  providers: [fhirHttpProvider, FhirService],
  controllers: [FhirMetadataController],
  exports: [FhirService],
})
export class FhirModule {}
