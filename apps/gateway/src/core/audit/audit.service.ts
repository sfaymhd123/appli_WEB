import { Injectable, Logger } from '@nestjs/common';
import { CodeSystems, HphiiUrls } from '@hphii/fhir-domain';

import { AuditEventHelper, FhirService } from '../fhir';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditAction } from './decorators/audit.decorator';

/** FHIR AuditEvent.outcome: 0 = success, 4 = minor, 8 = serious, 12 = major. */
export type AuditOutcome = '0' | '4' | '8' | '12';

export interface AuditRecordInput {
  action: AuditAction;
  /** Resource reference, e.g. "Patient/123". */
  entity: string;
  /** JWT sub (gateway user id) — never a patient identifier. */
  actorSub: string;
  actorRole: string;
  outcome?: AuditOutcome;
}

/** DICOM "Patient Record" event type (CLAUDE.md §5). */
const PATIENT_RECORD_TYPE_CODE = '110110';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly fhir: FhirService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Build an ATNA AuditEvent, post it to HAPI via FhirService, and mirror it in
   * the gateway DB. Non-blocking by design (CLAUDE.md §8 + user decision): a
   * HAPI failure is logged and still mirrored (fhirAuditEventId = null) so the
   * access is never silently lost. This method never rejects. PHI-safe: only
   * the resource reference + action are logged.
   */
  async record(input: AuditRecordInput): Promise<void> {
    const recorded = new Date();
    const outcome = input.outcome ?? '0';

    const event = AuditEventHelper.build({
      type: {
        system: CodeSystems.AUDIT_EVENT_TYPE_DICOM,
        code: PATIENT_RECORD_TYPE_CODE,
        display: 'Patient Record',
      },
      action: input.action,
      recorded: recorded.toISOString(),
      outcome,
      agent: [
        {
          type: { coding: [{ system: HphiiUrls.RBAC_ROLES, code: input.actorRole }] },
          who: { identifier: { value: input.actorSub } },
          requestor: true,
        },
      ],
      source: { observer: { display: 'hphii-gateway' } },
      entity: [{ what: { reference: input.entity } }],
    });

    let fhirAuditEventId: string | null = null;
    try {
      const created = await this.fhir.create(event);
      fhirAuditEventId = created.id ?? null;
    } catch (err) {
      this.logger.error(
        `Failed to post AuditEvent to HAPI for ${input.entity} (action ${input.action})`,
        err instanceof Error ? err.stack : undefined,
      );
    }

    try {
      await this.prisma.auditMirror.create({
        data: {
          actorSub: input.actorSub,
          actorRole: input.actorRole,
          action: input.action,
          entity: input.entity,
          outcome,
          recordedAt: recorded,
          fhirAuditEventId,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to mirror AuditEvent for ${input.entity} (action ${input.action})`,
        err instanceof Error ? err.stack : undefined,
      );
    }

    this.logger.log(`AuditEvent ${input.action} ${input.entity} (outcome ${outcome})`);
  }
}
