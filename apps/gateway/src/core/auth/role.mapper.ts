import type { Role as DomainRole } from '@hphii/fhir-domain';
import { Role as PrismaRole } from '@prisma/client';

/**
 * fhir-domain (the single source of truth, ARCH.md §6) uses the role string
 * 'Lab-Technician' with a hyphen. A Prisma enum identifier can't contain a
 * hyphen, so the schema declares `LabTechnician @map("Lab-Technician")`. These
 * exhaustive maps translate between the two representations without casts.
 */
const PRISMA_TO_DOMAIN: Record<PrismaRole, DomainRole> = {
  Physician: 'Physician',
  Nurse: 'Nurse',
  Admin: 'Admin',
  Pharmacist: 'Pharmacist',
  LabTechnician: 'Lab-Technician',
};

const DOMAIN_TO_PRISMA: Record<DomainRole, PrismaRole> = {
  Physician: 'Physician',
  Nurse: 'Nurse',
  Admin: 'Admin',
  Pharmacist: 'Pharmacist',
  'Lab-Technician': 'LabTechnician',
};

export const toDomainRole = (role: PrismaRole): DomainRole => PRISMA_TO_DOMAIN[role];
export const toPrismaRole = (role: DomainRole): PrismaRole => DOMAIN_TO_PRISMA[role];
