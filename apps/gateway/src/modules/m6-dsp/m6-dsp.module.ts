import { Module } from '@nestjs/common';

import { FhirModule } from '../../core/fhir';
import { M6DspController } from './m6-dsp.controller';
import { M6DspService } from './m6-dsp.service';

/** M6 — DSP / SHR: role-filtered $everything + DocumentReference export + audit trail (CLAUDE.md §6/§8). */
@Module({
  imports: [FhirModule],
  controllers: [M6DspController],
  providers: [M6DspService],
})
export class M6DspModule {}
