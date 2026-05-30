import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { Bundle, DocumentReference } from 'fhir/r4';
import { DspAction, Role } from '@hphii/fhir-domain';

import type { AuthenticatedUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { Audit } from '../../core/audit/decorators/audit.decorator';
import { RequireAction } from '../../core/rbac/decorators/require-action.decorator';
import { Roles } from '../../core/rbac/decorators/roles.decorator';
import { CreateDocumentDto } from './dto/create-document.dto';
import { M6DspService } from './m6-dsp.service';
import type { DspAuditTrail } from './m6-dsp.types';

/**
 * M6 — DSP / SHR. The Shared Health Record facade.
 * Guarded globally by JwtAuthGuard → RolesGuard; every route is audited.
 */
@Controller('dsp')
export class M6DspController {
  constructor(private readonly dsp: M6DspService) {}

  /**
   * Role-filtered Shared Health Record. All roles may read (§6 read_record),
   * but the returned Bundle is narrowed to the role's allowed resource types.
   */
  @Get(':patientId')
  @RequireAction(DspAction.READ_RECORD)
  @Audit('R')
  getRecord(
    @Param('patientId') patientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Bundle> {
    return this.dsp.getRecord(patientId, user.role);
  }

  /**
   * Export a summary DocumentReference. Enforced against the §6 "export" right
   * (Physician + Admin only) via @RequireAction.
   */
  @Post(':patientId/documents')
  @RequireAction(DspAction.EXPORT_RECORD)
  @Audit('E')
  @HttpCode(HttpStatus.CREATED)
  exportDocument(
    @Param('patientId') patientId: string,
    @Body() dto: CreateDocumentDto,
  ): Promise<DocumentReference> {
    return this.dsp.exportDocument(patientId, dto);
  }

  /** The patient's AuditEvent trail — admin + physician only. */
  @Get(':patientId/audit')
  @Roles(Role.ADMIN, Role.PHYSICIAN)
  @Audit('R')
  getAuditTrail(@Param('patientId') patientId: string): Promise<DspAuditTrail> {
    return this.dsp.getAuditTrail(patientId);
  }
}
