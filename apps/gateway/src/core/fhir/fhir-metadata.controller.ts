import { Controller, Get } from '@nestjs/common';
import type { CapabilityStatement } from 'fhir/r4';

import { FhirService } from './fhir.service';

/** Passthrough to HAPI's CapabilityStatement — confirms gateway↔HAPI connectivity. */
@Controller('fhir')
export class FhirMetadataController {
  constructor(private readonly fhir: FhirService) {}

  @Get('metadata')
  metadata(): Promise<CapabilityStatement> {
    return this.fhir.capabilityStatement();
  }
}
