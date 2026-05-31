import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import type { AppConfig } from '../config/configuration';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        // RS256: sign with the private key, verify with the public key.
        const privateKey = readFileSync(
          resolve(config.get('jwtPrivateKeyPath', { infer: true })),
          'utf8',
        );
        const publicKey = readFileSync(
          resolve(config.get('jwtPublicKeyPath', { infer: true })),
          'utf8',
        );
        const issuer = config.get('jwtIssuer', { infer: true });
        return {
          privateKey,
          publicKey,
          signOptions: { algorithm: 'RS256', issuer },
          verifyOptions: { algorithms: ['RS256'], issuer },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // JwtModule is re-exported so other modules (e.g. M4's SSE stream, which can't
  // use the bearer header) can verify access tokens with the same RS256 keys.
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
