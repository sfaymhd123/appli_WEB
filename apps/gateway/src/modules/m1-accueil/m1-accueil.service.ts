import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { Extension, Patient } from 'fhir/r4';
import { HphiiUrls, type CoverageScheme } from '@hphii/fhir-domain';

import { CoverageHelper, FhirService, PatientHelper, type SearchParams } from '../../core/fhir';
import type { CreateCoverageDto } from './dto/create-coverage.dto';
import type { CreatePatientDto } from './dto/create-patient.dto';
import type { SearchPatientsDto } from './dto/search-patients.dto';
import type { CoverageResult, EligibilityResult, PatientSearchResult } from './m1-accueil.types';

/** M1 — Accueil & Identité. Patient identity + RAMED/AMO/Private coverage. */
@Injectable()
export class M1AccueilService {
  private readonly logger = new Logger(M1AccueilService.name);

  constructor(private readonly fhir: FhirService) {}

  /** Create a Patient with a unique HPHII identifier and zone/risk extensions. */
  async register(dto: CreatePatientDto): Promise<Patient> {
    const mrn = await this.generateUniqueMrn();
    const patient = PatientHelper.build({
      active: true,
      identifier: [{ system: HphiiUrls.PATIENT_ID, value: mrn }],
      name: [{ family: dto.lastName, given: [dto.firstName] }],
      gender: dto.gender,
      // Year-precision FHIR date — matches the cohort seeder's birthDate.
      birthDate: String(dto.birthYear),
      extension: [
        { url: HphiiUrls.ZONE_TYPE, valueString: dto.zoneType },
        { url: HphiiUrls.RISK_GROUP, valueString: dto.riskGroup },
      ],
    });
    if (dto.phone) {
      patient.telecom = [{ system: 'phone', value: dto.phone, use: 'mobile' }];
    }
    this.logger.log('Registering Patient (new HPHII identifier allocated)');
    return this.fhir.create(patient);
  }

  /** Read one Patient by its HAPI logical id. */
  async findById(id: string): Promise<Patient> {
    return this.fhir.read<Patient>('Patient', id);
  }

  /**
   * Search patients. identifier/name use native HAPI search; zone and
   * risk-group are stored as extensions (not searchable in HAPI) and are
   * therefore filtered gateway-side over the returned page.
   */
  async search(query: SearchPatientsDto): Promise<PatientSearchResult> {
    const params: SearchParams = { _count: 50 };
    if (query.identifier) params.identifier = query.identifier;
    if (query.name) params.name = query.name;

    const bundle = await this.fhir.search<Patient>('Patient', params);
    let patients = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is Patient => PatientHelper.is(resource));

    if (query.zone) {
      patients = patients.filter(
        (p) => extensionValue(p.extension, HphiiUrls.ZONE_TYPE) === query.zone,
      );
    }
    if (query.riskGroup) {
      patients = patients.filter(
        (p) => extensionValue(p.extension, HphiiUrls.RISK_GROUP) === query.riskGroup,
      );
    }
    return { total: patients.length, patients };
  }

  /** Create a Coverage for a patient and run a simulated eligibility check. */
  async addCoverage(patientId: string, dto: CreateCoverageDto): Promise<CoverageResult> {
    // Confirm the patient exists (404s early; also anchors the AuditEvent entity).
    await this.fhir.read<Patient>('Patient', patientId);

    const coverage = CoverageHelper.build({
      status: 'active',
      beneficiary: { reference: `Patient/${patientId}` },
      type: {
        coding: [{ system: HphiiUrls.COVERAGE_SCHEME, code: dto.scheme, display: dto.scheme }],
        text: dto.scheme,
      },
      // Display-only payor — no Organization resource in this PoC.
      payor: [{ display: dto.scheme }],
    });
    if (dto.memberId) {
      coverage.subscriberId = dto.memberId;
    }
    const created = await this.fhir.create(coverage);
    return { coverage: created, eligibility: this.simulateEligibility(patientId, dto.scheme) };
  }

  /** Generate HPHII-{year}-{6 hex} and confirm it is unused in HAPI. */
  private async generateUniqueMrn(): Promise<string> {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
      const mrn = `HPHII-${year}-${suffix}`;
      const existing = await this.fhir.search<Patient>('Patient', {
        identifier: `${HphiiUrls.PATIENT_ID}|${mrn}`,
      });
      if ((existing.total ?? existing.entry?.length ?? 0) === 0) {
        return mrn;
      }
    }
    throw new Error('Could not allocate a unique patient identifier');
  }

  /**
   * Deterministic, PoC-only eligibility: stable per (patient, scheme); ~90%
   * active. This is a simulation, never a real payer verification.
   */
  private simulateEligibility(patientId: string, scheme: CoverageScheme): EligibilityResult {
    const active = hashString(`${patientId}|${scheme}`) % 100 < 90;
    return {
      active,
      status: active ? 'active' : 'inactive',
      scheme,
      simulated: true,
      checkedAt: new Date().toISOString(),
    };
  }
}

/** First matching extension's valueString, or undefined. */
function extensionValue(extensions: Extension[] | undefined, url: string): string | undefined {
  return extensions?.find((ext) => ext.url === url)?.valueString;
}

/** Tiny deterministic string hash; for simulation only, not security. */
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
