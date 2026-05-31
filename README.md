# HPHII Settat — Shared Health Record (SHR / DSP)

A working **proof-of-concept** of a modular Hospital Information System for **Hôpital
Provincial Hassan II de Settat**. It manages two patient pathways — **chronic** (CarePlan +
monitoring) and **episodic** (Encounter + triage) — and exposes a secure **Dossier de Santé
Partagé (DSP)** built entirely on **HL7 FHIR R4**.

- **Standard:** FHIR R4 — the NestJS gateway is a **FHIR facade** over a real HAPI FHIR server.
- **Terminologies:** LOINC (observations/labs), SNOMED CT (diagnoses/symptoms).
- **Constraints:** offline-first (rural patients) and an SMS channel.

> Academic PoC — **not production-ready**. Runs on a single laptop via Docker.
> The architecture is authoritative in [`CLAUDE.md`](./CLAUDE.md); see also
> [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and [`docs/API.md`](./docs/API.md).

## What's built — modules M1–M6

| Module | Name | FHIR resources | Status |
|---|---|---|---|
| **M1** | Accueil & Identité | Patient, Coverage | ✅ register, search, RAMED/AMO coverage |
| **M2** | Triage | Encounter, Task | ✅ 5-level triage; **P1 → DetectedIssue + SMS** |
| **M3** | Parcours (chronique + épisodique) | CarePlan, Condition, Encounter | ✅ plan/episode lifecycle, switch-to-chronic |
| **M4** | Monitoring & Alertes | Observation, DetectedIssue | ✅ threshold engine + **15-min escalation** |
| **M5** | Services médico-techniques | MedicationRequest, ServiceRequest, DiagnosticReport | ✅ pharmacy/lab/imaging |
| **M6** | DSP / SHR | DocumentReference, AuditEvent | ✅ role-filtered `$everything` + audit trail |
| — | Analytics | (aggregate read) | ✅ balanced-scorecard KPIs |

Cross-cutting: OAuth2 + JWT (RS256) + TOTP MFA · RBAC (5 roles, deny-by-default) ·
ATNA audit interceptor · BullMQ/Redis escalation timer · pluggable SMS · React PWA
with offline write-queue.

## Prerequisites

- **Node.js 20 LTS** (newer works).
- **Docker Desktop** (Compose v2+).
- **Python 3.11** (only for the cohort seeder in `tools/seed`).

## Quickstart — one command

```bash
cp .env.example .env          # Windows: copy .env.example .env
mkdir secrets && openssl genrsa -out secrets/jwt-private.pem 2048 \
  && openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem
npm install
npm run dev:up                # infra → wait for HAPI → migrate + seed users → cohort (if available) → both apps
```

`npm run dev:up` ([`scripts/dev-up.mjs`](./scripts/dev-up.mjs)) is idempotent and:

1. `docker compose up -d` — HAPI FHIR + Postgres ×2 + Redis,
2. waits for gateway Postgres + HAPI to be ready,
3. applies Prisma migrations (`prisma migrate deploy`),
4. seeds one gateway user per role,
5. seeds the 371-patient cohort into HAPI **if** Python + the dataset are present (else skips with a note),
6. starts the gateway (`:3000`) and web (`:5173`) — Ctrl-C stops both.

Useful variants: `npm run dev:up -- --no-apps` (just set me up), `-- --no-cohort`,
`-- --no-infra` (compose already running).

### Manual steps (equivalent)

```bash
docker compose up -d                                   # 1) infra
npm run setup                                          # 2) migrate + seed users + cohort (no apps)
npm run gateway:dev                                    # 3) gateway → http://localhost:3000  (health: /health)
npm run web:dev                                        # 4) web     → http://localhost:5173
npm run seed:cohort                                    # (re)seed the cohort into HAPI on demand
```

## Default ports

| Service | Port |
|---|---|
| HAPI FHIR | 8080 |
| Gateway (NestJS) | 3000 |
| Web (Vite) | 5173 |
| Redis | 6379 |
| Postgres (gateway) | 5433 (host) |

## Demo logins

All seeded users share the PoC password **`Passw0rd!`** (`SEED_PASSWORD` in `.env`); MFA is disabled.

| Role | Email |
|---|---|
| Physician | `physician@hphii.ma` |
| Nurse | `nurse@hphii.ma` |
| Admin | `admin@hphii.ma` |
| Pharmacist | `pharmacist@hphii.ma` |
| Lab-Technician | `lab@hphii.ma` |

## Demo script (scenario walkthrough)

> These flows create their own data, so they work whether or not the cohort is seeded.
> To browse seeded data instead, open **Patients** and pick any `pat-<n>`; chronic
> patients show an active CarePlan on their **Pathway** tab.

**1 · Register → triage → role-filtered DSP (M1 + M2 + M6)**
- Log in as **Nurse**. Register a patient (Patients → new). Note the new `pat-…` id.
- Run **Triage** for that patient with `symptomSeverity = critical` → priority **P1**;
  a `DetectedIssue` (severity high) is created and an SMS is logged to the **gateway console**
  (the referring-nurse notification, §8).
- Open the patient's **DSP** as **Nurse** → you see Patient + Observation + DetectedIssue only.
  Log in as **Physician**, open the same DSP → full record (CarePlan, DocumentReference, …).
  The two views come from one HAPI `$everything`, trimmed per role (§6).
- As **Physician/Admin**, open the patient's **Audit** trail → one `AuditEvent` per access (§8).

**2 · Observation → alert → 15-minute escalation (M4 — flagship)**
- For a live demo, set `ALERT_ESCALATION_SECONDS=20` in `.env` and restart the gateway
  (overrides the 15-minute timer so you don't wait).
- As **Nurse/Physician**, submit an observation `metric = systolic-bp`, `value = 160`
  (> 140 → severity **high**). An alert appears in **Monitoring** as **Pending**.
- **Acknowledge** it within the window → the BullMQ timer is cancelled (`Acknowledged`).
- Or **do nothing** → on timeout the alert flips to **`Escalated`** (via the
  `acknowledgement-status` extension — not a FHIR status) and a **senior-physician** SMS is
  logged to the console. No alert is ever silently lost (§8).

**3 · Chronic pathway & service orders (M3 + M5)**
- As **Physician**, open a patient's **Pathway** → create a chronic CarePlan (conditions, goals).
- **Physician** orders a medication (Services) → **Pharmacist** validates it from the queue (§6).
- **Physician** orders a lab study → **Lab-Technician** posts the DiagnosticReport (§6).

**4 · KPIs (Analytics)**
- As **Admin** or **Physician**, open **Analytics** → balanced-scorecard KPIs computed from
  FHIR (pathway mix, alert acknowledgement %, triage distribution, DSP access by role).

**5 · Offline-first (PWA)**
- In the browser devtools, set the network to **Offline**.
- Submit a triage or observation → it's queued in **IndexedDB** and the UI shows the offline banner.
- Go back **Online** → the queue replays automatically. Because each write carries a stable
  `clientRequestId`, the replay **upserts** (FHIR conditional-create) — no duplicate
  Encounter/Observation, and the one-shot alert/SMS/timer does not re-fire (§8).

## Testing

```bash
cd apps/gateway
npm test            # unit/integration (RBAC matrix, audit-once, M4 escalation, M6 filtering, …)
npm run test:e2e    # 2 end-to-end flows: register→triage→DSP, observation→alert→escalate (+ idempotency, audit, RBAC)
```

The e2e suite uses an **in-memory FHIR double** and a focused testing module (no HAPI/Redis/JWT),
so it stays deterministic and laptop-runnable.

## Auth keys (RS256)

The gateway signs JWTs with an RS256 key pair (paths in `.env`). Generate them locally:

```bash
mkdir secrets
openssl genrsa -out secrets/jwt-private.pem 2048
openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem
```

`secrets/` and `*.pem` are gitignored — keys are never committed.

## Repository layout

```
.
├── docker-compose.yml          # hapi-fhir, postgres-hapi, postgres-gateway, redis
├── .env.example
├── scripts/dev-up.mjs          # one-command startup orchestrator
├── apps/
│   ├── gateway/                # NestJS — API Gateway FHIR + modules M1..M6  (src/core, src/modules)
│   └── web/                    # React + Vite + TS (PWA, offline write-queue)
├── packages/
│   └── fhir-domain/            # shared TS: code systems, extension URLs, RBAC matrix, thresholds
├── tools/
│   └── seed/                   # Python xlsx → FHIR seeder + KPIs
├── docs/                       # ARCHITECTURE.md, API.md, kpis.json
└── data/                       # cohort xlsx (gitignored — PHI)
```

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — layered diagram + layer→folder map.
- [`docs/API.md`](./docs/API.md) — every endpoint (FHIR + auth), roles, audit codes, bodies.
- [`CLAUDE.md`](./CLAUDE.md) — authoritative architecture, RBAC matrix (§6), LOINC thresholds (§7), safety rules (§8).

## Conformance checklist

### Modules M1–M6

| Module | Implemented | FHIR resources | Verified by |
|---|---|---|---|
| M1 Accueil & Identité | ✅ register/search + RAMED-AMO coverage | Patient, Coverage | M1 unit tests; e2e Flow 1 |
| M2 Triage | ✅ 5-level engine, clinician override, P1 side-effects | Encounter, Task, DetectedIssue | M2 unit tests; e2e Flow 1 |
| M3 Parcours | ✅ chronic + episodic lifecycle, switch-to-chronic, review ack | CarePlan, Condition, Encounter, Goal, CareTeam | M3 unit tests |
| M4 Monitoring | ✅ §7 threshold engine, ack/resolve, 15-min escalation | Observation, DetectedIssue | M4 unit tests; e2e Flow 2 |
| M5 Services | ✅ med order + validate, lab/imaging order + result | MedicationRequest, ServiceRequest, DiagnosticReport | M5 unit tests |
| M6 DSP | ✅ role-filtered `$everything`, export, audit trail | DocumentReference, AuditEvent | M6 filtering tests; e2e Flow 1 |

### Clinical / safety rules (CLAUDE.md §8)

| Rule | Status | Where |
|---|---|---|
| No alert silently lost — explicit `DetectedIssue` lifecycle (`registered`→`preliminary`→`final`); escalation via `acknowledgement-status` extension (not a FHIR status) | ✅ | `m4-monitoring` service; escalation + filtering tests |
| 15-minute escalation → set `Escalated` + notify **senior physician** (SMS + in-app) | ✅ | BullMQ delayed job + `runEscalation`; e2e Flow 2 + unit tests |
| Every DSP access → exactly one `AuditEvent` (actor role, action, resource, time, outcome) | ✅ | `AuditInterceptor`; audit-once unit test + e2e audit assertion |
| P1 triage → auto `DetectedIssue` (high) + SMS to referring nurse | ✅ | `m2-triage` service; e2e Flow 1 |
| Offline-first — queue writes locally + replay; serve cached reads; idempotent APIs | ✅ | web `lib/offline/*` + gateway conditional-create; e2e idempotency test |
| RBAC deny-by-default, 5-role matrix (§6) | ✅ | `RolesGuard` + `PolicyService`; RBAC-matrix unit test + e2e RBAC test |
| All HAPI access via `core/fhir/fhir.service.ts`; no clinical data in gateway Postgres | ✅ | gateway architecture; `core/fhir` |

## Limitations (PoC)

Academic prototype — **not production-ready**. Seed/medication/lab payloads are clearly
labelled PoC data with **no clinically validated dosing or decision logic**. The default
SMS provider only logs to the console. Do not use with real patient data.
