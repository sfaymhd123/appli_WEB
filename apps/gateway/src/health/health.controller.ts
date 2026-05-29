import { Controller, Get } from '@nestjs/common';
import { ALL_ROLES } from '@hphii/fhir-domain';

interface HealthStatus {
  status: 'ok';
  service: string;
  rolesLoaded: number;
  timestamp: string;
}

@Controller('health')
export class HealthController {
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
