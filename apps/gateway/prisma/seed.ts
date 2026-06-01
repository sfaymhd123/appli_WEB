import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Seed one gateway user per RBAC role (ARCH.md §6). PoC only — all users
 * share a single, clearly non-production password, and MFA is disabled so
 * dev login is one-step. To exercise TOTP, set isMfaEnabled=true and a base32
 * totpSecret on a user (the /auth/mfa/verify flow + AuthService tests cover it).
 *
 *   npm run db:seed   # from apps/gateway (loads ../../.env)
 */
const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Passw0rd!';

const SEED_USERS: ReadonlyArray<{ email: string; role: Role }> = [
  { email: 'physician@hphii.ma', role: Role.Physician },
  { email: 'nurse@hphii.ma', role: Role.Nurse },
  { email: 'admin@hphii.ma', role: Role.Admin },
  { email: 'pharmacist@hphii.ma', role: Role.Pharmacist },
  { email: 'lab@hphii.ma', role: Role.LabTechnician },
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  for (const u of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role },
      create: { email: u.email, role: u.role, passwordHash, isMfaEnabled: false },
    });
    console.log(`Seeded ${u.role} <${u.email}>`);
  }
  console.log(`\nAll seed users share the PoC password: ${SEED_PASSWORD}`);
  console.log('MFA is disabled on seed users.');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
