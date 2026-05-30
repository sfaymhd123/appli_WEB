import { Controller, Get } from '@nestjs/common';
import { ALL_ROLES } from '@hphii/fhir-domain';

import { Public } from '../core/auth/decorators/public.decorator';

interface HealthStatus {
  status: 'ok';
  service: string;
  rolesLoaded: number;
  timestamp: string;
}

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): HealthStatus {
    // Reading ALL_ROLES proves @hphii/fhir-domain resolves at runtime in the gateway.
    return {
      status: 'ok',
      service: 'hphii-gateway',
      rolesLoaded: ALL_ROLES.length,
      timestamp: new Date().toISOString(),
    };
  }
}
