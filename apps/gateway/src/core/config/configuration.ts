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
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.GATEWAY_PORT ?? '3000', 10),
  hapiBaseUrl: process.env.HAPI_FHIR_BASE_URL ?? 'http://localhost:8080/fhir',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  smsProvider: process.env.SMS_PROVIDER ?? 'console',
  alertEscalationMinutes: parseInt(process.env.ALERT_ESCALATION_MINUTES ?? '15', 10),
});
