import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AppConfig } from '../config/configuration';
import type { AuthenticatedUser, JwtPayload } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<AppConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: readFileSync(resolve(config.get('jwtPublicKeyPath', { infer: true })), 'utf8'),
      algorithms: ['RS256'],
      issuer: config.get('jwtIssuer', { infer: true }),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    // The short-lived MFA-challenge token must never be accepted as a bearer.
    if (payload.purpose && payload.purpose !== 'access') {
      throw new UnauthorizedException('Invalid token');
    }
    return { sub: payload.sub, role: payload.role, email: payload.email };
  }
}
