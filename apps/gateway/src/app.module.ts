import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import configuration from './core/config/configuration';
import { HealthController } from './health/health.controller';

// Core cross-cutting layers (ARCH.md §4).
import { PrismaModule } from './core/prisma/prisma.module';
import { FhirModule } from './core/fhir/fhir.module';
import { AuthModule } from './core/auth/auth.module';
import { JwtAuthGuard } from './core/auth/guards/jwt-auth.guard';
import { RbacModule } from './core/rbac/rbac.module';
import { RolesGuard } from './core/rbac/guards/roles.guard';
import { AuditModule } from './core/audit/audit.module';
import { AuditInterceptor } from './core/audit/audit.interceptor';
import { EventsModule } from './core/events/events.module';
import { SmsModule } from './core/sms/sms.module';

// Functional modules M1..M6 (ARCH.md §2) — placeholders, filled in P5+.
import { M1AccueilModule } from './modules/m1-accueil/m1-accueil.module';
import { M2TriageModule } from './modules/m2-triage/m2-triage.module';
import { M3ParcoursModule } from './modules/m3-parcours/m3-parcours.module';
import { M4MonitoringModule } from './modules/m4-monitoring/m4-monitoring.module';
import { M5ServicesModule } from './modules/m5-services/m5-services.module';
import { M6DspModule } from './modules/m6-dsp/m6-dsp.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // .env lives at the repo root; the gateway runs from apps/gateway.
      envFilePath: ['../../.env'],
    }),
    // Core
    PrismaModule,
    FhirModule,
    AuthModule,
    RbacModule,
    AuditModule,
    EventsModule,
    SmsModule,
    // Modules M1..M6
    M1AccueilModule,
    M2TriageModule,
    M3ParcoursModule,
    M4MonitoringModule,
    M5ServicesModule,
    M6DspModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global security chain: authenticate (JWT) → authorize (RBAC) → audit.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
