import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { DspAction, type Role } from '@hphii/fhir-domain';

import { ACTION_KEY } from '../decorators/require-action.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PolicyService } from '../policy.service';
import { RolesGuard } from './roles.guard';

// Test doubles use loose typing where the Nest interfaces are large.
function makeReflector(action?: DspAction, roles?: Role[]): Reflector {
  return {
    getAllAndOverride: (key: string) =>
      key === ACTION_KEY ? action : key === ROLES_KEY ? roles : undefined,
  } as unknown as Reflector;
}

function makeContext(user?: { sub: string; role: Role; email: string }): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const policy = new PolicyService();
  const physician = { sub: 'p', role: 'Physician' as Role, email: 'doc@hphii.ma' };
  const pharmacist = { sub: 'r', role: 'Pharmacist' as Role, email: 'rx@hphii.ma' };
  const lab = { sub: 'l', role: 'Lab-Technician' as Role, email: 'lab@hphii.ma' };

  it('denies a Lab-Technician the validate_prescription action', () => {
    const guard = new RolesGuard(makeReflector(DspAction.VALIDATE_PRESCRIPTION), policy);
    expect(() => guard.canActivate(makeContext(lab))).toThrow(ForbiddenException);
  });

  it('allows a Physician and a Pharmacist to validate_prescription', () => {
    const guard = new RolesGuard(makeReflector(DspAction.VALIDATE_PRESCRIPTION), policy);
    expect(guard.canActivate(makeContext(physician))).toBe(true);
    expect(guard.canActivate(makeContext(pharmacist))).toBe(true);
  });

  it('denies a gated route when there is no authenticated principal', () => {
    const guard = new RolesGuard(makeReflector(DspAction.READ_RECORD), policy);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('passes through a route with no RBAC metadata', () => {
    const guard = new RolesGuard(makeReflector(undefined, undefined), policy);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('enforces @Roles() membership', () => {
    const guard = new RolesGuard(makeReflector(undefined, ['Physician', 'Nurse']), policy);
    expect(guard.canActivate(makeContext(physician))).toBe(true);
    expect(() => guard.canActivate(makeContext(lab))).toThrow(ForbiddenException);
  });
});
