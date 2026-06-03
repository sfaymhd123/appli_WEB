import { createHash, randomBytes } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './auth.types';
import { toDomainRole } from './role.mapper';

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  role: string;
}

export interface MfaRequiredResponse {
  mfa_required: true;
  mfa_token: string;
}

/** The MFA-challenge token is only valid long enough to enter a TOTP code. */
const MFA_CHALLENGE_TTL_SECONDS = 300;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** OAuth2 password grant. Returns tokens, or an MFA challenge if enrolled. */
  async login(email: string, password: string): Promise<TokenResponse | MfaRequiredResponse> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Same error whether the user is unknown or the password is wrong.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isMfaEnabled) {
      const mfaToken = await this.jwt.signAsync(
        { sub: user.id, purpose: 'mfa' },
        { expiresIn: MFA_CHALLENGE_TTL_SECONDS },
      );
      return { mfa_required: true, mfa_token: mfaToken };
    }

    return this.issueTokens(user);
  }

  /** Second factor: verify the TOTP code against the challenge, then issue tokens. */
  async verifyMfa(mfaToken: string, code: string): Promise<TokenResponse> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(mfaToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA challenge');
    }
    if (payload.purpose !== 'mfa') {
      throw new UnauthorizedException('Invalid MFA challenge');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isMfaEnabled || !user.totpSecret) {
      throw new UnauthorizedException('MFA is not configured for this user');
    }
    if (!authenticator.verify({ token: code, secret: user.totpSecret })) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    return this.issueTokens(user);
  }

  /** Rotate a refresh token: revoke the presented one, mint a fresh pair. */
  async refresh(refreshToken: string): Promise<TokenResponse> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(stored.user);
  }

  /** Revoke a refresh token (idempotent). */
  async logout(refreshToken: string): Promise<{ success: true }> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  /**
   * Request a password reset. Generates an opaque token, stores its hash,
   * and "sends" it to the user (logs to console for PoC).
   */
  async requestReset(email: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Avoid user enumeration: return success even if user not found.
      return { success: true };
    }

    const token = randomBytes(32).toString('hex');
    const hash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: hash, resetTokenExpiresAt: expiresAt },
    });

    // In a real app, this would be an email.
    console.log('\n================ PASSWORD RESET (PoC) ================');
    console.log(`User: ${email}`);
    console.log(`Token: ${token}`);
    console.log(`Link: http://localhost:5173/reset-password?token=${token}`);
    console.log('======================================================\n');

    return { success: true };
  }

  /**
   * Complete a password reset: verify the token, then update the password
   * and clear the reset fields.
   */
  async completeReset(token: string, newPassword: string): Promise<{ success: true }> {
    const hash = this.hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: {
        resetTokenHash: hash,
        resetTokenExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
    });

    return { success: true };
  }

  private async issueTokens(user: User): Promise<TokenResponse> {
    const role = toDomainRole(user.role);
    const accessTtl = this.config.get('jwtAccessTtl', { infer: true });
    const refreshTtl = this.config.get('jwtRefreshTtl', { infer: true });

    const payload: JwtPayload = { sub: user.id, role, email: user.email, purpose: 'access' };
    const access_token = await this.jwt.signAsync(payload, { expiresIn: accessTtl });

    const refresh_token = randomBytes(32).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refresh_token),
        userId: user.id,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { access_token, token_type: 'Bearer', expires_in: accessTtl, refresh_token, role };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
