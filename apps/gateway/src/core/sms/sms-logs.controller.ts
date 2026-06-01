import { Controller, Get, Delete, UseGuards } from '@nestjs/common';
import { Role } from '@hphii/fhir-domain';

import { Roles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { MemorySmsProvider, type SmsLogEntry } from './memory-sms.provider';

/**
 * Debugging / PoC endpoint to view "sent" SMS messages in environments where
 * the terminal log is not accessible. Admin-only.
 */
@Controller('sms/logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SmsLogsController {
  constructor(private readonly provider: MemorySmsProvider) {}

  @Get()
  getLogs(): SmsLogEntry[] {
    return this.provider.getLogs();
  }

  @Delete()
  clearLogs(): { success: true } {
    this.provider.clear();
    return { success: true };
  }
}
