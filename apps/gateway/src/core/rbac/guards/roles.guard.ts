import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { DspAction, Role } from '@hphii/fhir-domain';

import type { AuthenticatedUser } from '../../auth/auth.types';
import { ACTION_KEY } from '../decorators/require-action.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PolicyService } from '../policy.service';

/**
 * Global authorization guard. Runs after JwtAuthGuard, so req.user is set.
 * Enforces @Roles() membership and/or @RequireAction() against the §6 matrix.
 * Deny by default: a gated route with no authenticated principal is rejected.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policy: PolicyService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredAction = this.reflector.getAllAndOverride<DspAction | undefined>(ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No RBAC metadata → the route is not role-gated (auth already enforced).
    if (!requiredRoles && !requiredAction) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('No authenticated principal');
    }

    if (requiredRoles && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(`Role '${user.role}' is not permitted for this route`);
    }
    if (requiredAction && !this.policy.canPerform(user.role, requiredAction)) {
      throw new ForbiddenException(`Role '${user.role}' may not perform '${requiredAction}'`);
    }
    return true;
  }
}
