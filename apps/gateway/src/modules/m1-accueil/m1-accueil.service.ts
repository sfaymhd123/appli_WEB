import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { Bundle, Coverage, Extension, Patient, Practitioner } from 'fhir/r4';
import { HphiiUrls, Role, type CoverageScheme } from '@hphii/fhir-domain';

import { CoverageHelper, FhirService, PatientHelper, type SearchParams } from '../../core/fhir';
import type { AuthenticatedUser } from '../../core/auth/auth.types';
import { roleDemoCohortSize } from '../analytics/dashboard-role-profiles';
import type { CreateCoverageDto } from './dto/create-coverage.dto';
import type { CreatePatientDto } from './dto/create-patient.dto';
import type { SearchPatientsDto } from './dto/search-patients.dto';
import type { CoverageResult, EligibilityResult, PatientSearchResult } from './m1-accueil.types';
import { withDemoMobile } from './patient-demo-mobile';

/** M1 — Accueil & Identité. Patient identity + RAMED/AMO/Private coverage. */
const ADMIN_PATIENT_SEARCH_LIMIT = 5000;

@Injectable()
export class M1AccueilService {
  private readonly logger = new Logger(M1AccueilService.name);

  constructor(private readonly fhir: FhirService) {}

  /** Create a Patient with a unique HPHII identifier and zone/risk extensions. */
  async register(dto: CreatePatientDto): Promise<Patient> {
    const mrn = await this.generateUniqueMrn();
    const currentYear = new Date().getFullYear();
    const birthYear = parseInt(dto.birthDate.split('-')[0], 10);
    const age = currentYear - birthYear;

    // PoC logic (§5): Auto-assign to Elderly risk group if age >= 65.
    const effectiveRiskGroup = age >= 65 ? 'Elderly' : dto.riskGroup;

    const patient = PatientHelper.build({
      active: true,
      identifier: [{ system: HphiiUrls.PATIENT_ID, value: mrn }],
      name: [{ family: dto.lastName, given: [dto.firstName] }],
      gender: dto.gender,
      birthDate: dto.birthDate,
      extension: [
        { url: HphiiUrls.ZONE_TYPE, valueString: dto.zoneType },
        { url: HphiiUrls.RISK_GROUP, valueString: effectiveRiskGroup },
      ],
    });
    if (dto.phone) {
      patient.telecom = [{ system: 'phone', value: dto.phone, use: 'mobile' }];
    }
    if (dto.generalPractitioner) {
      await this.ensurePractitioner(dto.generalPractitioner);
      patient.generalPractitioner = [{ reference: dto.generalPractitioner }];
    }
    this.logger.log('Registering Patient (new HPHII identifier allocated)');
    return this.fhir.create(withDemoMobile(patient));
  }

  /** Read one Patient by its HAPI logical id. */
  async findById(id: string): Promise<Patient> {
    const patient = await this.fhir.read<Patient>('Patient', id);
    return withPatientDisplayDefaults(patient);
  }

  /** Create or Update a Practitioner (internal use for seeding). */
  async createPractitioner(resource: any): Promise<any> {
    return this.fhir.update(resource);
  }

  /**
   * Search patients. identifier/name use native HAPI search; zone and
   * risk-group are stored as extensions (not searchable in HAPI) and are
   * therefore filtered gateway-side over the returned page.
   */
  async search(query: SearchPatientsDto, user: AuthenticatedUser): Promise<PatientSearchResult> {
    const patientLimit = await this.patientSearchLimit(user);
    const params: SearchParams = { _count: Math.min(patientLimit, 1000), _sort: '-_lastUpdated' };
    if (query.identifier) {
      const idValue = query.identifier.trim();
      // If the user searches for "pat-123", they likely mean the logical ID.
      if (idValue.toLowerCase().startsWith('pat-')) {
        params._id = idValue;
      } else {
        params.identifier = idValue;
      }
    }
    if (query.name) params.name = query.name;

    const patients: Patient[] = [];
    let bundle = await this.fhir.search<Patient>('Patient', params);

    while (bundle && patients.length < patientLimit) {
      patients.push(...this.matchingPatients(bundle, query).slice(0, patientLimit - patients.length));

      const nextLink = bundle.link?.find((link) => link.relation === 'next')?.url;
      if (!nextLink) break;
      bundle = await this.fhir.searchByUrl<Patient>(nextLink);
    }

    const enrichedPatients = await this.withCoverageSchemes(patients);
    enrichedPatients.sort(comparePatientsByLastUpdatedDesc);
    return { total: enrichedPatients.length, patients: enrichedPatients };
  }

  private matchingPatients(bundle: Bundle<Patient>, query: SearchPatientsDto): Patient[] {
    return (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is Patient => PatientHelper.is(resource))
      .filter((patient) => {
        if (query.zone && extensionValue(patient.extension, HphiiUrls.ZONE_TYPE) !== query.zone) {
          return false;
        }
        if (
          query.riskGroup &&
          extensionValue(patient.extension, HphiiUrls.RISK_GROUP) !== query.riskGroup
        ) {
          return false;
        }
        return true;
      })
      .map((patient) => withPatientDisplayDefaults(patient));
  }

  private async patientSearchLimit(user: AuthenticatedUser): Promise<number> {
    if (user.role === Role.ADMIN) return ADMIN_PATIENT_SEARCH_LIMIT;

    const assignedCount = await this.assignedPatientCount(user);
    return roleDemoCohortSize(user.role, assignedCount);
  }

  private async assignedPatientCount(user: AuthenticatedUser): Promise<number> {
    if (user.role !== Role.PHYSICIAN && user.role !== Role.NURSE) return 0;

    const bundle = await this.fhir.search<Patient>('Patient', {
      'general-practitioner': `Practitioner/${user.sub}`,
      _summary: 'count',
    });
    return bundle.total ?? 0;
  }

  private async ensurePractitioner(reference: string): Promise<void> {
    const match = /^Practitioner\/([^/]+)$/.exec(reference);
    if (!match) return;

    const id = match[1];
    try {
      await this.fhir.read<Practitioner>('Practitioner', id);
    } catch {
      await this.fhir.update<Practitioner>({
        resourceType: 'Practitioner',
        id,
        active: true,
      });
    }
  }

  /** Create a Coverage for a patient and run a simulated eligibility check. */
  async addCoverage(patientId: string, dto: CreateCoverageDto): Promise<CoverageResult> {
    // Confirm the patient exists (404s early; also anchors the AuditEvent entity).
    const patient = await this.fhir.read<Patient>('Patient', patientId);

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
    await this.fhir.update(withCoverageScheme(patient, dto.scheme));
    return { coverage: created, eligibility: this.simulateEligibility(patientId, dto.scheme) };
  }

  private async withCoverageSchemes(patients: Patient[]): Promise<Patient[]> {
    const missingCoverage = patients.filter((patient) => !extensionValue(patient.extension, HphiiUrls.COVERAGE_SCHEME));
    if (missingCoverage.length === 0) return patients;

    const coverageByPatient = new Map<string, CoverageScheme>();
    for (const chunk of chunkArray(missingCoverage, 80)) {
      const refs = chunk
        .map((patient) => patient.id)
        .filter((id): id is string => Boolean(id))
        .map((id) => `Patient/${id}`);
      if (refs.length === 0) continue;

      const bundle = await this.fhir.search<Coverage>('Coverage', {
        beneficiary: refs.join(','),
        status: 'active',
        _count: 1000,
      });
      for (const entry of bundle.entry ?? []) {
        const coverage = entry.resource;
        const patientId = coverage?.beneficiary?.reference?.replace(/^Patient\//, '');
        const scheme = coverageScheme(coverage);
        if (patientId && scheme && !coverageByPatient.has(patientId)) {
          coverageByPatient.set(patientId, scheme);
        }
      }
    }

    if (coverageByPatient.size === 0) return patients;

    return patients.map((patient) => {
      const scheme = patient.id ? coverageByPatient.get(patient.id) : undefined;
      return scheme ? withCoverageScheme(patient, scheme) : patient;
    });
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

function comparePatientsByLastUpdatedDesc(a: Patient, b: Patient): number {
  const aTime = Date.parse(a.meta?.lastUpdated ?? '');
  const bTime = Date.parse(b.meta?.lastUpdated ?? '');
  const aSortable = Number.isNaN(aTime) ? 0 : aTime;
  const bSortable = Number.isNaN(bTime) ? 0 : bTime;
  return bSortable - aSortable;
}

function withPatientDisplayDefaults(patient: Patient): Patient {
  return withDemoBirthDate(withDemoMobile(withDemoHphiiIdentifier(patient)));
}

function withDemoHphiiIdentifier(patient: Patient): Patient {
  if (patient.identifier?.some((id) => id.system === HphiiUrls.PATIENT_ID && isHphiiIdentifier(id.value))) {
    return patient;
  }

  return {
    ...patient,
    identifier: [
      { system: HphiiUrls.PATIENT_ID, value: demoHphiiIdentifier(patient) },
      ...(patient.identifier ?? []),
    ],
  };
}

function demoHphiiIdentifier(patient: Patient): string {
  const stableId =
    patient.identifier?.[0]?.value ??
    patient.id ??
    patient.name?.[0]?.family ??
    patient.birthDate ??
    'patient';
  const suffix = (hashString(`${stableId}|hphii-id`) % 0xffffff)
    .toString(16)
    .padStart(6, '0')
    .toUpperCase();
  return `HPHII-${new Date().getFullYear()}-${suffix}`;
}

function isHphiiIdentifier(value: string | undefined): boolean {
  return /^HPHII-\d{4}-[A-Z0-9]{6}$/i.test(value ?? '');
}

function withCoverageScheme(patient: Patient, scheme: CoverageScheme): Patient {
  const extensions = (patient.extension ?? []).filter((ext) => ext.url !== HphiiUrls.COVERAGE_SCHEME);
  return {
    ...patient,
    extension: [...extensions, { url: HphiiUrls.COVERAGE_SCHEME, valueString: scheme }],
  };
}

function coverageScheme(coverage: Coverage | undefined): CoverageScheme | undefined {
  const codedScheme = coverage?.type?.coding?.find((coding) => coding.system === HphiiUrls.COVERAGE_SCHEME)?.code;
  const scheme = codedScheme ?? coverage?.type?.text;
  return isCoverageScheme(scheme) ? scheme : undefined;
}

function isCoverageScheme(value: string | undefined): value is CoverageScheme {
  return value === 'RAMED' || value === 'AMO' || value === 'Private';
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function withDemoBirthDate(patient: Patient): Patient {
  if (!/^\d{4}$/.test(patient.birthDate ?? '')) return patient;

  const stableId =
    patient.identifier?.find((id) => id.system === HphiiUrls.PATIENT_ID)?.value ??
    patient.identifier?.[0]?.value ??
    patient.id ??
    patient.name?.[0]?.family ??
    patient.birthDate;
  const seed = hashString(`${stableId}|birth-date`);
  const month = String((seed % 12) + 1).padStart(2, '0');
  const day = String((Math.floor(seed / 12) % 28) + 1).padStart(2, '0');

  return {
    ...patient,
    birthDate: `${patient.birthDate}-${month}-${day}`,
  };
}

/** Tiny deterministic string hash; for simulation only, not security. */
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
