import { Injectable } from '@nestjs/common';
import {
  allowedResourcesForRole,
  canPerform,
  type DspAction,
  type FilteredResourceType,
  type Role,
} from '@hphii/fhir-domain';

/**
 * Single authorization decision point. Delegates to the fhir-domain matrices
 * (CLAUDE.md §6) so the policy is never duplicated. Exported for M5/M6 to reuse
 * (e.g. the role → $everything resource filter).
 */
@Injectable()
export class PolicyService {
  /** Whether `role` may perform `action` on the DSP (deny by default). */
  canPerform(role: Role, action: DspAction): boolean {
    return canPerform(role, action);
  }

  /** The FHIR resource types a role's $everything Bundle may contain. */
  allowedResources(role: Role): readonly FilteredResourceType[] {
    return allowedResourcesForRole(role);
  }
}
