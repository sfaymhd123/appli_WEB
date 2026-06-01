# Architecture — HPHII SHR / DSP

> Academic **proof-of-concept**, not production-ready. The authoritative
> architecture spec lives in [`../ARCH.md`](../ARCH.md); this document is the
> human-readable companion — the layered diagram from the report rendered in
> text, plus how every layer maps to a folder in the repo.

## 1. One-paragraph summary

The system is a **modular monolith**: a single NestJS application (the *API
Gateway FHIR*) that fronts a real **HAPI FHIR R4** server. Everything clinical is
a FHIR resource and lives in HAPI; the gateway never stores clinical data. The
gateway adds the things HAPI does not: OAuth2 + JWT + TOTP auth, RBAC, an ATNA
audit trail, a BullMQ escalation timer, SMS/in-app notifications, and six
business modules (M1–M6). A React + Vite PWA is the operator UI and is
offline-first for rural use. The boundaries are kept clean so a module can later
be peeled off into its own service without rewrites.

## 2. Layered diagram (text)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  PRESENTATION — React 18 + Vite 5 PWA            apps/web                   │
│  TanStack Query · React Router · Tailwind · service worker + IndexedDB     │
│  Offline-first: cached reads, queued writes replayed on reconnect          │
└───────────────────────────────┬────────────────────────────────────────────┘
                                 │  HTTPS / JSON (Bearer JWT)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  API GATEWAY (NestJS modular monolith)           apps/gateway/src           │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  CROSS-CUTTING REQUEST PIPELINE  (global, runs on every request)   │    │
│  │  ValidationPipe → JwtAuthGuard → RolesGuard → AuditInterceptor     │    │
│  │       (DTO)        (authN)       (authZ §6)     (ATNA §8)          │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│  ┌────────── BUSINESS MODULES (one folder per M1..M6 + analytics) ──────┐ │
│  │  M1 Accueil  M2 Triage  M3 Parcours  M4 Monitoring  M5 Services  M6 DSP│ │
│  │  Patient/    Encounter/ CarePlan/    Observation/    Medication/  Doc/  │ │
│  │  Coverage    Task       Condition    DetectedIssue   Diagnostic  Audit │ │
│  └──────────────────────────────────┬───────────────────────────────────┘ │
│                                      │ all clinical reads/writes            │
│  ┌───────────────────────────────────▼──────────────────────────────────┐ │
│  │  FHIR FACADE — core/fhir/fhir.service.ts (the ONLY door to HAPI)      │ │
│  │  typed axios wrapper · per-resource builders · conditional-create     │ │
│  └───────────────────────────────────┬──────────────────────────────────┘ │
│                                      │                                      │
│  ┌─── CORE SERVICES (cross-cutting, injected into modules) ─────────────┐  │
│  │  auth · rbac · audit · events (DomainEventBus) · notifications · sms  │  │
│  │  config · prisma                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────┬─────────────────────┬───────────────────────┬───────────────────────┘
       │ FHIR R4 REST        │ Prisma                 │ BullMQ jobs
       ▼                     ▼                        ▼
┌────────────────┐  ┌──────────────────┐   ┌────────────────────────────────┐
│  HAPI FHIR JPA │  │ Postgres (gateway)│   │  Redis + BullMQ                 │
│  + Postgres    │  │ users · roles ·   │   │  15-min escalation timer (§8)   │
│  ALL clinical  │  │ MFA · audit mirror│   │  delayed job → escalate + SMS   │
│  data (R4)     │  │ NO clinical data  │   │                                 │
└────────────────┘  └──────────────────┘   └────────────────────────────────┘
       ▲
       │ one-time seed (Python: xlsx → FHIR transaction bundles)
┌────────────────┐
│  tools/seed     │  371-patient cohort → HAPI; also computes docs/kpis.json
└────────────────┘
```

## 3. Layer → folder map

### Presentation — `apps/web/src`

| Concern | Folder / file |
|---|---|
| App shell, routing, role-aware nav | `App.tsx`, `routes/protected-route.tsx`, `lib/nav/nav-config.ts`, `components/layout/` |
| Feature screens (one per module) | `features/{patients,triage,pathway,monitoring,services,dsp,analytics,dashboard}/` |
| API client + typed hooks | `lib/api/axios.ts`, `lib/api/hooks/`, `lib/api/types/` |
| Auth (token store, JWT decode, context) | `lib/auth/` |
| **Offline-first** (IndexedDB queue, replay) | `lib/offline/{db,queue,use-offline-queue}.ts`, `lib/hooks/use-online-status.ts`, `components/ui/offline-banner.tsx` |
| Reusable UI kit | `components/ui/` |

### API Gateway — `apps/gateway/src`

**Bootstrap**
- `main.ts` — global `ValidationPipe({ whitelist, transform })`, listens on `:3000`.
- `app.module.ts` — wires every module and registers the global chain via
  `APP_GUARD` (Jwt → Roles) and `APP_INTERCEPTOR` (Audit).

**Cross-cutting core** — `core/`

| Layer | Folder | Responsibility |
|---|---|---|
| FHIR facade | `core/fhir/` | `fhir.service.ts` is the **only** HAPI client; `resources/` holds per-resource builders; `conditionalCreate` underpins idempotent replay. |
| AuthN | `core/auth/` | OAuth2 password grant, JWT (RS256), TOTP MFA, `JwtAuthGuard`, `@Public`, `@CurrentUser`. |
| AuthZ (§6) | `core/rbac/` | `RolesGuard`, `PolicyService` (DSP action matrix), `@Roles`, `@RequireAction`. |
| Audit (§8, ATNA) | `core/audit/` | `AuditInterceptor` posts one `AuditEvent` to HAPI + mirrors metadata to Postgres; `@Audit('C'\|'R'\|'U'\|'D'\|'E')`. |
| Events | `core/events/` | `DomainEventBus` — in-process pub/sub + SSE source for live alerts. |
| Notifications | `core/notifications/` | `NotificationService` fans out to SMS + in-app channels. |
| SMS | `core/sms/` | `SmsProvider` interface; default `ConsoleSmsProvider` (pluggable, never hard-coded). |
| Config | `core/config/` | `@nestjs/config` — all secrets/URLs via env. |
| Gateway DB | `core/prisma/` | `PrismaService` — users/roles/MFA/audit-mirror only. |

**Business modules** — `core/` is consumed by `modules/`

| Module | Folder | FHIR resources | Key behaviour |
|---|---|---|---|
| M1 Accueil & Identité | `modules/m1-accueil/` | Patient, Coverage | unique ID, RAMED/AMO coverage |
| M2 Triage | `modules/m2-triage/` | Encounter, Task | 5-level triage; P1 → DetectedIssue + SMS |
| M3 Parcours | `modules/m3-parcours/` | CarePlan, Condition, Encounter | chronic + episodic lifecycle |
| M4 Monitoring | `modules/m4-monitoring/` | Observation, DetectedIssue | threshold engine + **15-min escalation** |
| M5 Services | `modules/m5-services/` | MedicationRequest, ServiceRequest, DiagnosticReport | pharmacy/lab/imaging |
| M6 DSP | `modules/m6-dsp/` | DocumentReference, AuditEvent | role-filtered `$everything` + audit trail |
| Analytics | `modules/analytics/` | (aggregate read) | balanced-scorecard KPIs |

### Shared domain — `packages/fhir-domain`

Single source of truth for code systems, HPHII extension URLs (§5), the RBAC
matrix + `$everything` role filter (§6), LOINC thresholds (§7), and the
acknowledgement-status / role enums. Imported by **both** gateway and web so the
two never drift.

### Data & tooling

| Concern | Location |
|---|---|
| Clinical store (FHIR R4) | HAPI FHIR JPA + `postgres-hapi` (Docker) |
| Gateway store (no clinical data) | `postgres-gateway` (Docker) + `apps/gateway/prisma/` |
| Escalation timer / async | Redis + BullMQ |
| Cohort seeder + KPIs | `tools/seed/seed.py` → `docs/kpis.json` |
| Infra definition | `docker-compose.yml` |

## 4. Request lifecycle (a DSP read)

```
GET /dsp/:id  (Bearer JWT)
  │
  ├─ ValidationPipe        validate/transform params
  ├─ JwtAuthGuard          verify RS256 token → req.user {sub, role}
  ├─ RolesGuard            @RequireAction(read_record) → PolicyService allows?  (deny by default §6)
  ├─ M6DspController       → M6DspService
  │     └─ FhirService.operationEverything(id)   → HAPI  $everything
  │     └─ filter Bundle by role (§6 table)      → tag with rbac-filter
  └─ AuditInterceptor      on success → POST AuditEvent to HAPI + mirror row   (§8 one event per access)
```

## 5. Key architectural decisions

- **Gateway is a facade, never a second source of truth.** All clinical reads
  and writes funnel through `core/fhir/fhir.service.ts`. No module talks to HAPI
  directly; the gateway Postgres holds only users/roles/MFA/audit-mirror.
- **Deny-by-default security as a global pipeline.** Guards and the audit
  interceptor are registered once in `app.module.ts`, so a new route is gated and
  audited unless it explicitly opts out with `@Public`.
- **Role filtering is dynamic, never duplicated.** `GET /Patient/{id}/$everything`
  returns one HAPI bundle; the gateway trims it per JWT role (§6). Clinical data
  is stored once.
- **Idempotent writes for offline replay (§8).** M2/M4 writes carry a stable
  client-request-id stamped onto `Encounter`/`Observation.identifier`; the gateway
  uses FHIR conditional-create (`If-None-Exist`) so a replayed write matches the
  original instead of duplicating, and one-shot side-effects (alert/SMS/timer) are
  suppressed on the replay.
- **Escalation is durable, not best-effort (§8).** The 15-minute timer is a
  BullMQ delayed job in Redis; on timeout it sets the `acknowledgement-status`
  extension to `Escalated` (escalation is **not** a FHIR status) and notifies the
  senior physician. Acknowledging cancels the job.
- **Modular monolith → microservices later.** Clean module boundaries (M1–M6 each
  in their own folder, core services injected) mean a module can be extracted
  without rewiring the others — the deployment roadmap's 3 phases.
