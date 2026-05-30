import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

import { AuthService, type TokenResponse } from './auth.service';

interface FakeUser {
  id: string;
  email: string;
  role: string;
  passwordHash: string;
  isMfaEnabled: boolean;
  totpSecret: string | null;
}

function makeService(user: FakeUser | null) {
  const signAsync = jest.fn().mockResolvedValue('signed.jwt');
  const verifyAsync = jest.fn();
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
  } as unknown as ConstructorParameters<typeof AuthService>[0];
  const jwt = { signAsync, verifyAsync } as unknown as ConstructorParameters<typeof AuthService>[1];
  const config = {
    get: (key: string) =>
      key === 'jwtAccessTtl' ? 900 : key === 'jwtRefreshTtl' ? 2_592_000 : undefined,
  } as unknown as ConstructorParameters<typeof AuthService>[2];

  return { service: new AuthService(prisma, jwt, config), signAsync, verifyAsync };
}

describe('AuthService', () => {
  beforeAll(() => {
    // Tolerate a TOTP step boundary between generate and verify.
    authenticator.options = { window: 1 };
  });

  it('rejects an unknown user / bad password with 401', async () => {
    const { service } = makeService(null);
    await expect(service.login('nobody@hphii.ma', 'pw')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns mfa_required when MFA is enabled', async () => {
    const passwordHash = await bcrypt.hash('correct', 10);
    const { service, signAsync } = makeService({
      id: 'u1',
      email: 'd@hphii.ma',
      role: 'Physician',
      passwordHash,
      isMfaEnabled: true,
      totpSecret: 'BASE32SECRET',
    });

    const res = await service.login('d@hphii.ma', 'correct');

    expect(res).toEqual({ mfa_required: true, mfa_token: 'signed.jwt' });
    expect(signAsync).toHaveBeenCalledWith(
      { sub: 'u1', purpose: 'mfa' },
      expect.objectContaining({ expiresIn: expect.any(Number) }),
    );
  });

  it('issues tokens directly when MFA is disabled', async () => {
    const passwordHash = await bcrypt.hash('correct', 10);
    const { service } = makeService({
      id: 'u2',
      email: 'n@hphii.ma',
      role: 'Nurse',
      passwordHash,
      isMfaEnabled: false,
      totpSecret: null,
    });

    const res = (await service.login('n@hphii.ma', 'correct')) as TokenResponse;

    expect(res).toMatchObject({
      access_token: 'signed.jwt',
      token_type: 'Bearer',
      expires_in: 900,
      role: 'Nurse',
    });
    expect(typeof res.refresh_token).toBe('string');
  });

  it('verifyMfa issues tokens for a valid TOTP code', async () => {
    const secret = authenticator.generateSecret();
    const code = authenticator.generate(secret);
    const { service, verifyAsync } = makeService({
      id: 'u1',
      email: 'd@hphii.ma',
      role: 'Physician',
      passwordHash: 'unused',
      isMfaEnabled: true,
      totpSecret: secret,
    });
    verifyAsync.mockResolvedValue({ sub: 'u1', purpose: 'mfa' });

    const res = await service.verifyMfa('mfa.jwt', code);

    expect(res).toMatchObject({ access_token: 'signed.jwt', role: 'Physician' });
  });

  it('verifyMfa rejects an invalid TOTP code', async () => {
    const secret = authenticator.generateSecret();
    const { service, verifyAsync } = makeService({
      id: 'u1',
      email: 'd@hphii.ma',
      role: 'Physician',
      passwordHash: 'unused',
      isMfaEnabled: true,
      totpSecret: secret,
    });
    verifyAsync.mockResolvedValue({ sub: 'u1', purpose: 'mfa' });

    await expect(service.verifyMfa('mfa.jwt', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
