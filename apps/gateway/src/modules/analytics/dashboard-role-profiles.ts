import { Role } from '@hphii/fhir-domain';

export const SEEDED_PATIENT_COUNT = 371;

export interface RoleDemoProfile {
  cohortSize: number;
  pathwayFactor: number;
  triageFactor: number;
  observationFactor: number;
  resultFactor: number;
  medicationFactor: number;
  alertFactor: number;
}

export const ROLE_DEMO_PROFILES: Record<Role, RoleDemoProfile> = {
  [Role.PHYSICIAN]: {
    cohortSize: 520,
    pathwayFactor: 1.15,
    triageFactor: 0.85,
    observationFactor: 0.95,
    resultFactor: 0.9,
    medicationFactor: 0.7,
    alertFactor: 1.1,
  },
  [Role.NURSE]: {
    cohortSize: 560,
    pathwayFactor: 0.9,
    triageFactor: 1.35,
    observationFactor: 1.5,
    resultFactor: 0.65,
    medicationFactor: 0.55,
    alertFactor: 1.25,
  },
  [Role.ADMIN]: {
    cohortSize: 0,
    pathwayFactor: 1,
    triageFactor: 1,
    observationFactor: 1,
    resultFactor: 1,
    medicationFactor: 1,
    alertFactor: 1,
  },
  [Role.PHARMACIST]: {
    cohortSize: 480,
    pathwayFactor: 0.6,
    triageFactor: 0.35,
    observationFactor: 0.45,
    resultFactor: 0.35,
    medicationFactor: 1.7,
    alertFactor: 0.6,
  },
  [Role.LAB_TECHNICIAN]: {
    cohortSize: 510,
    pathwayFactor: 0.7,
    triageFactor: 0.55,
    observationFactor: 0.8,
    resultFactor: 1.6,
    medicationFactor: 0.25,
    alertFactor: 0.75,
  },
};

export function roleDemoCohortSize(role: Role, assignedCount = 0): number {
  return role === Role.ADMIN ? assignedCount : ROLE_DEMO_PROFILES[role].cohortSize + assignedCount;
}
