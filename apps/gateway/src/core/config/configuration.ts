/**
 * Typed runtime configuration, loaded by @nestjs/config (see app.module.ts).
 * All values come from env vars (CLAUDE.md §9: secrets only via env).
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  hapiBaseUrl: string;
  redisUrl: string;
  smsProvider: string;
  alertEscalationMinutes: number;
  /**
   * Optional sub-minute escalation delay (seconds). When > 0 it overrides
   * `alertEscalationMinutes` — used only to make the 15-min timer observable in
   * a live demo/test. Leave unset (0) in normal operation.
   */
  alertEscalationSeconds: number;
  /** SMS destinations for alerts (CLAUDE.md §8). PoC defaults; override via env. */
  referringNursePhone: string;
  seniorPhysicianPhone: string;
  /** SMS destination for M5 abnormal-result notifications to the ordering physician. */
  orderingPhysicianPhone: string;
  /** Gateway Postgres (auth/RBAC/audit mirror — NO clinical data). Consumed by Prisma. */
  gatewayDatabaseUrl: string;
  /** RS256 key material for signing/verifying JWTs. Paths are read at boot (PEM contents). */
  jwtPrivateKeyPath: string;
  jwtPublicKeyPath: string;
  jwtIssuer: string;
  /** Access/refresh token lifetimes, in seconds. */
  jwtAccessTtl: number;
  jwtRefreshTtl: number;
  /** Label shown in authenticator apps for TOTP MFA. */
  mfaIssuer: string;
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.GATEWAY_PORT ?? '3000', 10),
  hapiBaseUrl: process.env.HAPI_FHIR_BASE_URL ?? 'http://localhost:8080/fhir',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  smsProvider: process.env.SMS_PROVIDER ?? 'console',
  alertEscalationMinutes: parseInt(process.env.ALERT_ESCALATION_MINUTES ?? '15', 10),
  alertEscalationSeconds: parseInt(process.env.ALERT_ESCALATION_SECONDS ?? '0', 10),
  referringNursePhone: process.env.REFERRING_NURSE_PHONE ?? '+212600000001',
  seniorPhysicianPhone: process.env.SENIOR_PHYSICIAN_PHONE ?? '+212600000000',
  orderingPhysicianPhone: process.env.ORDERING_PHYSICIAN_PHONE ?? '+212600000002',
  gatewayDatabaseUrl:
    process.env.GATEWAY_DATABASE_URL ??
    'postgresql://gateway:gateway@localhost:5433/gateway?schema=public',
  jwtPrivateKeyPath: process.env.JWT_PRIVATE_KEY_PATH ?? './secrets/jwt-private.pem',
  jwtPublicKeyPath: process.env.JWT_PUBLIC_KEY_PATH ?? './secrets/jwt-public.pem',
  jwtIssuer: process.env.JWT_ISSUER ?? 'hphii-shr',
  jwtAccessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
  jwtRefreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '2592000', 10),
  mfaIssuer: process.env.MFA_ISSUER ?? 'HPHII-SHR',
});
