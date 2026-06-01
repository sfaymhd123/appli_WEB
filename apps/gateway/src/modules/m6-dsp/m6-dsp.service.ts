import { Injectable, Logger } from '@nestjs/common';
import type { AuditEvent, Bundle, BundleEntry, DocumentReference, Patient } from 'fhir/r4';
import {
  CodeSystems,
  HphiiUrls,
  RoleLabels,
  allowedResourcesForRole,
  type Role,
} from '@hphii/fhir-domain';

import { AuditEventHelper, DocumentReferenceHelper, FhirService } from '../../core/fhir';
import type { CreateDocumentDto } from './dto/create-document.dto';
import type { DspAuditEntry, DspAuditTrail } from './m6-dsp.types';

/** LOINC "Patient summary Document" — the type of the exported DSP summary. */
const PATIENT_SUMMARY_LOINC = '60591-5';

/**
 * M6 — DSP / SHR. Exposes the Shared Health Record:
 *  - role-filtered Patient/$everything (ARCH.md §6 role → resource map),
 *  - export of a summary DocumentReference (§6 "export" right),
 *  - the patient's AuditEvent trail (§8 — every access is audited).
 *
 * Filtering is performed dynamically at the gateway from the caller's role;
 * clinical data is never duplicated per role.
 */
@Injectable()
export class M6DspService {
  private readonly logger = new Logger(M6DspService.name);

  constructor(private readonly fhir: FhirService) {}

  /**
   * Role-filtered Shared Health Record. Calls Patient/$everything, then keeps
   * only the resource types the caller's role may see, and tags the Bundle with
   * the RBAC-filter system so consumers can see it was narrowed.
   */
  async getRecord(patientId: string, role: Role): Promise<Bundle> {
    const everything = await this.fhir.operationEverything(patientId, { count: 1000 });
    return this.filterBundle(everything, role);
  }

  /**
   * Export a summary DocumentReference for the patient. The "export" right is
   * enforced upstream by @RequireAction(EXPORT_RECORD) (Physician + Admin only).
   */
  async exportDocument(patientId: string, dto: CreateDocumentDto): Promise<DocumentReference> {
    // 404s early if the patient does not exist; also anchors the AuditEvent entity.
    await this.fhir.read<Patient>('Patient', patientId);

    const now = new Date().toISOString();
    const body =
      dto.contentText ??
      `Résumé du dossier de santé partagé (DSP) — Patient/${patientId}.\n` +
        `Document généré par la passerelle HPHII (prototype). ` +
        `Données non validées cliniquement — usage de démonstration uniquement.`;

    const document = DocumentReferenceHelper.build({
      status: 'current',
      docStatus: 'final',
      type: {
        coding: [
          { system: CodeSystems.LOINC, code: PATIENT_SUMMARY_LOINC, display: 'Patient summary Document' },
        ],
        text: 'Résumé du dossier patient',
      },
      subject: { reference: `Patient/${patientId}` },
      date: now,
      description: dto.description ?? 'Export du dossier de santé partagé (PoC).',
      author: [{ display: 'HPHII Gateway (PoC export)' }],
      content: [
        {
          attachment: {
            contentType: 'text/plain; charset=utf-8',
            language: 'fr',
            title: dto.title ?? `Résumé DSP — Patient/${patientId}`,
            creation: now,
            // PoC: the summary text is inlined as base64 rather than stored in XDS.b.
            data: Buffer.from(body, 'utf8').toString('base64'),
          },
        },
      ],
    });

    const created = await this.fhir.create(document);
    this.logger.log(`Exported DocumentReference for Patient/${patientId}`);
    return created;
  }

  /** The patient's AuditEvent trail, most recent first (admin/physician only). */
  async getAuditTrail(patientId: string): Promise<DspAuditTrail> {
    const bundle = await this.fhir.search<AuditEvent>('AuditEvent', {
      entity: `Patient/${patientId}`,
      _count: 200,
      _sort: '-date',
    });
    const events = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is AuditEvent => AuditEventHelper.is(resource))
      .map((event) => this.toAuditEntry(event));
    return { patientId, total: events.length, events };
  }

  /** Global DocumentReference list (M6). */
  async listDocuments(): Promise<Bundle<DocumentReference>> {
    return this.fhir.search<DocumentReference>('DocumentReference', {
      _count: 100,
      _sort: '-date',
    });
  }

  /** Global AuditEvent trail (Admin only). */
  async listGlobalAuditTrail(): Promise<DspAuditTrail> {
    const bundle = await this.fhir.search<AuditEvent>('AuditEvent', {
      _count: 500,
      _sort: '-date',
    });
    const events = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is AuditEvent => AuditEventHelper.is(resource))
      .map((event) => this.toAuditEntry(event));
    return { patientId: 'all', total: events.length, events };
  }

  /** Keep only entries whose resource type the role is allowed to see; tag the Bundle. */
  private filterBundle(bundle: Bundle, role: Role): Bundle {
    const allowed = allowedResourcesForRole(role);
    const allowedSet = new Set<string>(allowed);
    const entries: BundleEntry[] = (bundle.entry ?? []).filter((entry) => {
      const type = entry.resource?.resourceType;
      return type !== undefined && allowedSet.has(type);
    });

    this.logger.log(
      `DSP record filtered for role ${role}: ${entries.length}/${bundle.entry?.length ?? 0} resources`,
    );

    return {
      resourceType: 'Bundle',
      type: 'searchset',
      timestamp: new Date().toISOString(),
      total: entries.length,
      meta: {
        tag: [
          {
            system: HphiiUrls.RBAC_FILTER,
            code: role,
            display: `DSP filtered for role ${RoleLabels[role]} (${role}); allowed: ${allowed.join(', ')}`,
          },
        ],
      },
      entry: entries,
    };
  }

  /** Project an AuditEvent to a PHI-safe trail row. */
  private toAuditEntry(event: AuditEvent): DspAuditEntry {
    const agent = event.agent?.[0];
    return {
      id: event.id,
      action: event.action,
      recorded: event.recorded,
      actorRole: agent?.type?.coding?.[0]?.code,
      actorId: agent?.who?.identifier?.value,
      outcome: event.outcome,
      entity: event.entity?.[0]?.what?.reference,
    };
  }
}
