import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { DemoService } from './demo.service';
import type { DemoRunResult } from './demo.types';

/**
 * Dev/demo convenience endpoint. One POST seeds a complete patient journey
 * (M1→M6) by driving the gateway's own endpoints as each RBAC role — so the
 * real auth + RBAC + audit pipeline runs for every step (ARCH.md §11).
 *
 * Authenticated like any other route (the global JwtAuthGuard applies — a valid
 * token is required) but **not** role-gated: any logged-in user may trigger it.
 * The service refuses to run in production. This is NOT a clinical feature.
 */
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  /** Seed the full demo scenario; returns the created patient + per-step log. */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  run(): Promise<DemoRunResult> {
    return this.demo.runScenario();
  }
}
