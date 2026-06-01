import { SetMetadata } from '@nestjs/common';
import type { Role } from '@hphii/fhir-domain';

/** Restrict a route to one or more of the 5 RBAC roles (ARCH.md §6). */
export const ROLES_KEY = 'rbac:roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
