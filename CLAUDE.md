# CLAUDE.md — HPHII Settat · Shared Health Record (SHR / DSP)

> Project memory for Claude Code. Read at every session start.
> Keep this file as the **single source of truth** for the architecture.
> When in doubt, prefer FHIR R4 conformance over convenience.

## 1. Project overview

Working **prototype / proof-of-concept** of a modular Hospital Information System for
**Hôpital Provincial Hassan II de Settat (HPHII)**. It manages two patient pathways —
**chronic** (CarePlan + monitoring) and **episodic** (Encounter + triage) — and exposes a
secure **Dossier de Santé Partagé (DSP / Shared Health Record)**.

- **Central standard:** HL7 **FHIR R4** (everything is a FHIR resource; the gateway is a FHIR facade).
- **Terminologies:** **LOINC** (observations/labs), **SNOMED CT** (diagnoses/symptoms/procedures).
- **Integration profiles:** IHE **PIX/PDQ** (identity), **XDS.b** (documents), **ATNA** (audit).
- **Empirical anchor:** a real cohort of **371 patients** (Excel dataset). Seed the system from it.
- **Hard constraints:** **offline-first** (45.3% rural patients) and **SMS** channel (62% of interactions).

This is an academic PoC. Do not claim production-readiness. Keep it runnable on a single laptop via Docker.

## 2. The 6 functional modules (and their FHIR resources)

| Module | Name | Primary FHIR resources | Core responsibility |
|---|---|---|---|
| **M1** | Accueil & Identité | `Patient`, `Coverage` | Unique patient ID, RAMED/AMO coverage check |
| **M2** | Triage | `Encounter`, `Task` | Algorithmic triage (5 levels P1–P5), routing |
| **M3a** | Parcours chronique | `CarePlan`, `Flag`, `Condition` | Longitudinal care plan, goals, careTeam |
| **M3b** | Parcours épisodique | `Encounter`, `Condition` | Acute episode lifecycle |
| **M4** | Monitoring & Alertes | `Observation`, `DetectedIssue` | Vitals capture, threshold engine, **15-min escalation** |
| **M5** | Services médico-techniques | `MedicationRequest`, `DiagnosticReport`, `ServiceRequest` | Pharmacy, lab, imaging |
| **M6** | DSP / SHR | `DocumentReference`, `AuditEvent` | Role-filtered record access + audit trail |

The gateway is a **modular monolith** (one NestJS app, one module folder per M1–M6).
Boundaries must stay clean so it can later be split into microservices (deployment roadmap, 3 phases).

## 3. Tech stack (use these — do not substitute without asking)

| Layer | Technology | Notes |
|---|---|---|
| FHIR repository | **HAPI FHIR JPA Server** (`hapiproject/hapi` Docker image), FHIR **R4** | The real data store. We run it; we do not rewrite it. |
| FHIR repo DB | **PostgreSQL 16** | Backs HAPI. |
| API Gateway + business logic | **Node.js 20 LTS + TypeScript 5 + NestJS 10** | Acts as the "API Gateway FHIR" layer. |
| Gateway DB | **PostgreSQL 16 + Prisma** | Users, roles, sessions, MFA secrets, audit mirror. **No clinical data here** — clinical data lives in HAPI. |
| Auth | **OAuth2 (password grant) + JWT (RS256)**, **TOTP MFA** | passport-jwt. Refresh tokens. |
| Authorization | **RBAC** via Nest Guards | 5 roles. Matrix in §6. |
| Audit | Nest interceptor → **`AuditEvent`** (IHE ATNA) posted to HAPI | Every DSP access is audited. |
| Events / escalation | **BullMQ + Redis** | Delayed job = the 15-min alert timer; on timeout → escalate + SMS. |
| SMS | `SmsProvider` interface; default **`ConsoleSmsProvider`** (logs); optional Twilio adapter | Pluggable. Never hard-code a provider. |
| FHIR client (Node) | thin typed `axios` wrapper + `@types/fhir` (R4) | One `FhirService`; all HAPI calls go through it. |
| Frontend | **React 18 + Vite 5 + TypeScript**, **TanStack Query**, **React Router**, **Tailwind CSS** | Lightweight for low-bandwidth. |
| Offline-first | **vite-plugin-pwa** (service worker + cache + background sync) | Mandatory for rural mode. |
| Data seeding / analysis | **Python 3.11 + pandas + openpyxl + requests** | Reads the cohort xlsx, maps → FHIR, POSTs to HAPI. |
| Tests | **Jest + Supertest** (gateway), **Vitest + Testing Library** (web) | |

## 4. Repository layout

```
hphii-shr/
├── CLAUDE.md
├── docker-compose.yml          # hapi-fhir, postgres-hapi, postgres-gateway, redis
├── .env.example
├── apps/
│   ├── gateway/                # NestJS — API Gateway FHIR + modules M1..M6
│   │   └── src/
│   │       ├── core/           # fhir/ auth/ rbac/ audit/ events/ sms/ config/
│   │       └── modules/        # m1-accueil/ m2-triage/ m3-parcours/ m4-monitoring/ m5-services/ m6-dsp/
│   └── web/                    # React + Vite + TS (PWA)
├── packages/
│   └── fhir-domain/            # shared TS: code systems, extension URLs, RBAC matrix, LOINC thresholds, role-filter map
├── tools/
│   └── seed/                   # Python xlsx → FHIR seeder + KPI computation
└── docs/
```

## 5. FHIR coding systems & HPHII custom extensions (use these exact URLs)

Standard systems:
- LOINC: `http://loinc.org`
- SNOMED CT: `http://snomed.info/sct`
- UCUM (units): `http://unitsofmeasure.org`
- Interpretation: `http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation`
- AuditEvent type (DICOM): `http://dicom.nema.org/resources/ontology/DCM`

HPHII custom extension/identifier URLs (keep them constant in `packages/fhir-domain`):
- Patient identifier system: `https://hphii.ma/fhir/patient-id`
- Zone type (Rural/Urban/Peri-urban): `https://hphii.ma/fhir/zone-type`
- Risk group (Standard/Chronic-risk/Elderly/Pediatric): `https://hphii.ma/fhir/risk-group`
- Coverage scheme (RAMED/AMO/Private): `https://hphii.ma/fhir/coverage-scheme`
- Alert source: `https://hphii.ma/fhir/alert-source`
- Acknowledgement status (Pending/Acknowledged/Escalated): `https://hphii.ma/fhir/acknowledgement-status`
- Escalation timer (minutes): `https://hphii.ma/fhir/escalation-timer-minutes`
- RBAC roles: `https://hphii.ma/fhir/rbac-roles`
- RBAC filter tag: `https://hphii.ma/fhir/rbac-filter`

## 6. RBAC — the 5 roles and their rights (authoritative matrix)

Roles (code → label): `Physician` (Médecin), `Nurse` (Infirmier), `Admin` (Administrateur),
`Pharmacist` (Pharmacien), `Lab-Technician` (Laborantin).

**Action matrix on the DSP** (deny by default; only `Yes` is allowed):

| Action | Physician | Nurse | Admin | Pharmacist | Lab-Technician |
|---|---|---|---|---|---|
| Read full record | Yes | Yes (partial) | Yes (admin) | Yes (meds) | Yes (lab) |
| Modify clinical record | Yes | Yes (care) | No | No | No |
| Add biological result | No | No | No | No | Yes |
| Validate prescription | Yes | No | No | Yes | No |
| Export record | Yes | No | Yes | No | No |
| Archive record | No | No | Yes | No | No |

**Role → `$everything` Bundle filter** (what `GET /Patient/{id}/$everything` returns per role):

| Role | Resources returned |
|---|---|
| Physician | Patient + CarePlan + Observation + DetectedIssue + DocumentReference (full) |
| Nurse | Patient + Observation + DetectedIssue |
| Lab-Technician | DiagnosticReport only |
| Pharmacist | MedicationRequest only |
| Admin | Patient + AuditEvent |

Filtering is done **dynamically at the gateway** from the JWT role. Never duplicate clinical data per role.

## 7. M4 monitoring — LOINC codes & alert thresholds (authoritative)

| Observation | LOINC | Unit | Auto-alert rule → DetectedIssue.severity |
|---|---|---|---|
| Systolic BP | `8480-6` | mmHg | > 140 → **high** |
| Diastolic BP | `8462-4` | mmHg | > 90 → **moderate** |
| Fasting glucose | `2339-0` | mg/dL | > 126 → **moderate** |
| Post-prandial glucose | `2345-7` | mg/dL | > 200 → **high** |
| HbA1c | `4548-4` | % | > 7 → trigger CarePlan review |
| Heart rate | `8867-4` | bpm | < 50 or > 120 → **high** |
| Serum creatinine | `2160-0` | mg/dL | > 1.2 (M) / > 1.0 (F) → alert |

## 8. Clinical / safety rules (never violate)

- **No alert is ever silently lost.** Every `DetectedIssue` has an explicit lifecycle.
  - FHIR `DetectedIssue.status`: `registered` → `preliminary` (acknowledged) → `final` (resolved).
    `escalated` is **not** a valid FHIR status — model escalation via the
    `acknowledgement-status` extension (`Pending`/`Acknowledged`/`Escalated`).
- **15-minute escalation:** if a `high`/`critical` alert is not acknowledged within 15 min,
  the BullMQ job fires: set `acknowledgement-status` = `Escalated`, notify the **senior physician**
  via SMS + in-app. This is the project's flagship feature — do not weaken it.
- **Every DSP access → one `AuditEvent`** (actor role, action R/U/…, resource, timestamp, outcome). No exceptions.
- **P1 triage (critical, ~7.8% of cases)** auto-creates a `DetectedIssue` (severity high) + SMS to the referring nurse.
- **Offline-first:** write operations must queue locally (PWA background sync) and replay when back online;
  reads must serve from cache when offline. Design APIs to be idempotent where possible.

## 9. Coding conventions

- TypeScript everywhere on the JS side; **strict** mode on. No `any` unless justified with a comment.
- File names: `kebab-case`. Classes/types: `PascalCase`. Functions/vars: `camelCase`.
- One responsibility per Nest provider. Controllers thin, services hold logic.
- **All HAPI calls go through `core/fhir/fhir.service.ts`.** Never call HAPI with raw fetch from a module.
- DTO validation with `class-validator`/`zod` at the controller boundary; HAPI validates FHIR resources.
- **PHI safety:** never log patient identifiers, vitals, or tokens. Log resource *types* and IDs only.
- Secrets only via env vars (`@nestjs/config`). Never commit `.env`. Keep `.env.example` current.
- Conventional Commits (`feat:`, `fix:`, `chore:`…). Small, reviewable commits.
- French is fine for user-facing UI text; **code, identifiers, and comments in English.**

## 10. Commands

```bash
# Infra (HAPI FHIR + Postgres x2 + Redis)
docker compose up -d

# Gateway (NestJS)
cd apps/gateway && npm install && npm run start:dev      # http://localhost:3000
npm run test                                             # Jest + Supertest

# Web (React + Vite)
cd apps/web && npm install && npm run dev                # http://localhost:5173

# Seed cohort data (xlsx → FHIR → HAPI)
cd tools/seed && pip install -r requirements.txt
python seed.py --xlsx ../../data/Telehealth_Framework_Complete.xlsx --fhir-base http://localhost:8080/fhir
```

Default ports: HAPI FHIR `8080`, gateway `3000`, web `5173`, Redis `6379`.

## 11. Do NOT

- Do not invent FHIR fields or non-standard status codes. If a concept isn't in FHIR R4, use a **named extension** under `https://hphii.ma/fhir/...`.
- Do not put clinical data in the gateway Postgres — it belongs in HAPI.
- Do not bypass the API Gateway, RBAC guard, or audit interceptor for any DSP access.
- Do not hard-code an SMS provider, secrets, or environment-specific URLs.
- Do not add heavyweight infra (Kafka, k8s, service mesh). Keep the PoC laptop-runnable.
- Do not implement real-world prescriptions/dosing logic as if clinically validated; label PoC data clearly.

## 12. Build order (phased — see CLAUDE_CODE_PROMPTS.md)

Foundation → Phase 1 (M1+M2+M6) → Phase 2 (M3+M4) → Phase 3 (M5) → polish.
Follow `CLAUDE_CODE_PROMPTS.md` step by step. Commit after each step. Update this file if the architecture changes.
