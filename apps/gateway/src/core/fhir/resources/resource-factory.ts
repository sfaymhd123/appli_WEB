import type { Resource } from 'fhir/r4';

export interface ResourceHelper<T extends Resource> {
  /** Build a minimal resource of this type; the caller supplies required fields. */
  build(init?: Partial<Omit<T, 'resourceType'>>): T;
  /** Runtime type guard narrowing an unknown value to this resource type. */
  is(value: unknown): value is T;
}

/**
 * Produces a typed builder + guard pair for one FHIR resource type. Pure
 * structure — no business rules (those live in the M1..M6 modules).
 */
export function defineResource<T extends Resource>(
  resourceType: T['resourceType'],
): ResourceHelper<T> {
  return {
    build: (init = {}) => ({ resourceType, ...init }) as T,
    is: (value): value is T =>
      typeof value === 'object' &&
      value !== null &&
      (value as { resourceType?: unknown }).resourceType === resourceType,
  };
}
