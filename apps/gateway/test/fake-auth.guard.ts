import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Role } from '@hphii/fhir-domain';

import type { AuthenticatedUser } from '../src/core/auth/auth.types';

interface TestRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

/**
 * Test stand-in for JwtAuthGuard. It does NOT authorize — it only attaches the
 * principal the real JwtStrategy would, reading the role/sub from `x-test-role`
 * and `x-test-sub` headers so the *real* RolesGuard (which runs next) can make
 * the §6 decision. Omitting the role header leaves req.user undefined, which
 * lets the suite assert deny-by-default on a gated route.
 */
@Injectable()
export class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<TestRequest>();
    const role = header(req.headers['x-test-role']);
    if (role) {
      const sub = header(req.headers['x-test-sub']) ?? 'test-user';
      req.user = { sub, role: role as Role, email: `${sub}@hphii.ma` };
    }
    return true;
  }
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
