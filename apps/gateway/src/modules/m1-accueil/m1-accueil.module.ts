import { Module } from '@nestjs/common';

import { FhirModule } from '../../core/fhir';
import { M1AccueilController } from './m1-accueil.controller';
import { M1AccueilService } from './m1-accueil.service';

/** M1 — Accueil & Identité: Patient + Coverage (ARCH.md §2). */
@Module({
  imports: [FhirModule],
  controllers: [M1AccueilController],
  providers: [M1AccueilService],
})
export class M1AccueilModule {}
