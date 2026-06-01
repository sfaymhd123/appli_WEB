import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Patient } from 'fhir/r4';
import { Role } from '@hphii/fhir-domain';

import { Audit } from '../../core/audit/decorators/audit.decorator';
import { Roles } from '../../core/rbac/decorators/roles.decorator';
import { CreateCoverageDto } from './dto/create-coverage.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { SearchPatientsDto } from './dto/search-patients.dto';
import { M1AccueilService } from './m1-accueil.service';
import type { CoverageResult, PatientSearchResult } from './m1-accueil.types';

/** Minimal shape of the response object we need — avoids an express type dep. */
interface ResponseLike {
  setHeader(name: string, value: string): void;
}

/**
 * M1 — Accueil & Identité. Patient identity + coverage.
 * Front-desk + clinical roles only; Pharmacist/Lab-Technician are out of scope
 * here (their access is narrowed to meds/lab per ARCH.md §6).
 * Guarded globally by JwtAuthGuard → RolesGuard; mutations/reads are audited.
 */
@Controller('patients')
@Roles(Role.PHYSICIAN, Role.NURSE, Role.ADMIN, Role.PHARMACIST, Role.LAB_TECHNICIAN)
export class M1AccueilController {
  constructor(private readonly m1: M1AccueilService) {}

  /** Register a new patient; returns 201 + Location of the created resource. */
  @Post()
  @Roles(Role.PHYSICIAN, Role.NURSE, Role.ADMIN)
  @Audit('C')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: CreatePatientDto,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<Patient> {
    const patient = await this.m1.register(dto);
    if (patient.id) {
      res.setHeader('Location', `/patients/${patient.id}`);
    }
    return patient;
  }

  /** Search patients by identifier, name, zone, or risk group. */
  @Get()
  search(@Query() query: SearchPatientsDto): Promise<PatientSearchResult> {
    return this.m1.search(query);
  }

  /** Read one patient record. */
  @Get(':id')
  @Audit('R')
  findOne(@Param('id') id: string): Promise<Patient> {
    return this.m1.findById(id);
  }

  /** Attach a coverage and run a simulated eligibility check. */
  @Post(':id/coverage')
  @Roles(Role.PHYSICIAN, Role.NURSE, Role.ADMIN)
  @Audit('C')
  @HttpCode(HttpStatus.CREATED)
  addCoverage(
    @Param('id') id: string,
    @Body() dto: CreateCoverageDto,
  ): Promise<CoverageResult> {
    return this.m1.addCoverage(id, dto);
  }
}
