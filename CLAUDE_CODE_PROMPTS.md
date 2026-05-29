# Claude Code — Prompt Playbook · HPHII SHR / DSP

This is your **step-by-step build kit**. The project is large, so it is split into small,
self-contained steps. Each step = one focused prompt you paste into Claude Code, in order.

## How to use this file

1. Create an empty folder `hphii-shr/` and put **`CLAUDE.md`** at its root (Claude Code reads it automatically every session).
2. Put your dataset at `hphii-shr/data/Telehealth_Framework_Complete.xlsx`.
3. Open Claude Code in that folder (`claude` in the terminal, or the desktop app pointed at the folder).
4. Paste the prompts **one at a time, in order**. Let each finish, run it, then **commit** before the next.
5. For the bigger steps (P2, P8), type `plan` first so Claude Code proposes a plan before editing.
6. If something breaks, paste the error back and ask Claude Code to fix it — don't jump ahead.

> Tip: every prompt below assumes `CLAUDE.md` is loaded, so it stays short and refers to it.
> Commit message suggestions are given as `→ commit: ...`.

---

# PHASE 0 — Foundation

## P0 · Monorepo, Docker infra & skeletons

```
Set up the monorepo skeleton described in CLAUDE.md §4. Do not implement business logic yet.

1. Create the folder structure: apps/gateway, apps/web, packages/fhir-domain, tools/seed, docs, data.
2. docker-compose.yml with 4 services:
   - hapi-fhir: image hapiproject/hapi:latest, FHIR R4, port 8080, env to use postgres-hapi.
   - postgres-hapi: PostgreSQL 16 for HAPI.
   - postgres-gateway: PostgreSQL 16 for the gateway (separate DB).
   - redis: for BullMQ.
   Use named volumes and a shared network. Add healthchecks.
3. .env.example with every variable used (DB URLs, JWT keys path, HAPI base URL, Redis URL, SMS provider=console). Add .gitignore (node_modules, dist, .env, __pycache__, etc.).
4. apps/gateway: scaffold a NestJS 10 + TypeScript (strict) app with @nestjs/config. Create empty core/ subfolders (fhir, auth, rbac, audit, events, sms, config) and modules/ subfolders (m1-accueil … m6-dsp), each with a placeholder *.module.ts wired into AppModule. Add a GET /health endpoint.
5. apps/web: scaffold React 18 + Vite 5 + TypeScript, Tailwind CSS, React Router, TanStack Query, and vite-plugin-pwa (registered but minimal). One placeholder page showing "HPHII SHR".
6. packages/fhir-domain: a TS package exporting, as typed constants, everything in CLAUDE.md §5 (code systems + extension URLs), §6 (RBAC action matrix + role→$everything filter map), and §7 (LOINC thresholds). Both apps import from it.
7. Root README.md with the §10 commands.

Make sure `docker compose up -d`, `npm run start:dev` (gateway), and `npm run dev` (web) all start cleanly.
```

→ commit: `chore: scaffold monorepo, docker infra, app skeletons`

## P1 · FHIR core layer (the gateway's single door to HAPI)

```
Implement core/fhir in the gateway per CLAUDE.md §9. This is the ONLY place that talks to HAPI.

1. FhirService (injectable): typed methods create<T>, read<T>, update<T>, patch, search (returns Bundle), and operationEverything(patientId, opts). Use axios against process.env.HAPI_FHIR_BASE_URL, content-type application/fhir+json, with @types/fhir R4 types.
2. Robust error mapping: translate HAPI OperationOutcome errors into clean Nest exceptions.
3. A small typed helper module per resource we use (Patient, Encounter, Task, CarePlan, Condition, Flag, Observation, DetectedIssue, MedicationRequest, DiagnosticReport, ServiceRequest, DocumentReference, AuditEvent, Coverage) — just builders/guards, no business rules yet.
4. Add a /fhir/metadata passthrough that returns HAPI's CapabilityStatement so we can confirm connectivity.
5. Unit tests for FhirService with a mocked HTTP layer.

Verify against a running HAPI: create a Patient and read it back.
```

→ commit: `feat(core): FHIR R4 client service + resource helpers`

## P2 · Auth (OAuth2 + JWT + MFA) · RBAC guard · ATNA audit

```
Implement the cross-cutting security layer per CLAUDE.md §3, §6, §8. Type `plan` first.

AUTH (core/auth):
- Prisma schema on postgres-gateway: User (email, passwordHash, role enum of the 5 roles, totpSecret, isMfaEnabled), RefreshToken. No clinical data here.
- OAuth2 password grant + JWT (RS256, keys from env path). Endpoints: POST /auth/login (email+password → if MFA, return mfa_required), POST /auth/mfa/verify (TOTP via otplib), POST /auth/refresh, POST /auth/logout. Seed one user per role.
- JWT carries sub + role. passport-jwt strategy + JwtAuthGuard.

RBAC (core/rbac):
- RolesGuard + @Roles() decorator enforcing the §6 action matrix (deny by default).
- A PolicyService exposing canPerform(role, action) and the role→$everything resource filter map from fhir-domain.

AUDIT / ATNA (core/audit):
- A global interceptor that, for every request touching a patient record, posts an AuditEvent (IHE ATNA) to HAPI via FhirService: agent.role = JWT role, action (R/C/U/D), entity = Patient/{id}, recorded timestamp, outcome. Also mirror a minimal row in the gateway DB for fast querying.
- Never log PHI (CLAUDE.md §9).

Tests: a Lab-Technician is denied "validate prescription"; a successful read produces exactly one AuditEvent.
```

→ commit: `feat(core): OAuth2+JWT+MFA, RBAC guard, ATNA audit interceptor`

## P3 · Python seeding pipeline (xlsx → FHIR → HAPI) + KPIs

```
Build tools/seed per CLAUDE.md §3 and the dataset structure below. Python 3.11 + pandas + openpyxl + requests.

The Excel file has 12 sheets. Map each to FHIR R4 and POST to HAPI (--fhir-base):
- Patients(patient_id, sex, birth_year, residence_area, risk_group, created_date) → Patient
  (identifier system https://hphii.ma/fhir/patient-id; zone-type, risk-group, coverage-scheme extensions).
- Pathway_Cases(case_id, patient_id, case_type, start/end, status) → CarePlan (Chronic) or Encounter (Episodic).
- Triage(triage_id, interaction_id, datetime, mode, priority_level, outcome) → Encounter + Task (P1–P5).
- Symptom_Reports(... symptom_type, severity, duration_days) → Condition/Observation (SNOMED CT where known).
- Monitoring_Data(session_id, case_id, obs_type, value, unit, datetime) → Observation with the correct LOINC
  code per obs_type (CLAUDE.md §7) and UCUM unit; set interpretation H when above threshold.
- Alerts(alert_id, case_id, datetime, alert_level, alert_source, status) → DetectedIssue
  (severity from alert_level; acknowledgement-status extension from status: Pending/Acknowledged/Escalated).
- Service_Orders(order_id, case_id, service_type, datetime, priority, status) → ServiceRequest / MedicationRequest.
- Service_Results(result_id, order_id, result_type, datetime, abnormal, notes) → DiagnosticReport.
- SHR_Access_Log(access_id, patient_id, actor_role, datetime, resource_type, action) → AuditEvent (ATNA).

Requirements:
- Idempotent: stable resource ids derived from source ids (e.g. Patient/pat-1986); use PUT (upsert) so re-running doesn't duplicate.
- A --dry-run flag that validates + prints counts without POSTing.
- After seeding, compute and print the key KPIs the report uses (chronic vs episodic %, monitoring count, % abnormal, alert acknowledgement rate incl. % unacknowledged, DSP access by role) and write them to docs/kpis.json.
- requirements.txt + a short tools/seed/README.md.

Run it for real and report the inserted counts and KPI summary.
```

→ commit: `feat(seed): cohort xlsx → FHIR R4 seeder + KPI computation`

## P4 · React shell, design system & login

```
Build the web app shell per CLAUDE.md §3 (lightweight, low-bandwidth friendly).

1. Tailwind design tokens: calm clinical palette, large tap targets, high contrast (rural/older users). Reusable components: Button, Card, Badge (priority/severity colors P1–P5 and high/moderate/low), Table, Modal, Toast, Spinner, EmptyState, OfflineBanner.
2. Auth flow against P2: login form → MFA step → store tokens (in memory + refresh handling), an axios instance that injects the JWT and refreshes on 401. AuthContext exposing the current user + role.
3. App layout: top bar (user, role badge, online/offline indicator) + role-aware left nav. Nav items are filtered by role (a Lab-Technician sees only what §6 allows). Protected routes via React Router.
4. A typed API client layer (TanStack Query hooks) pointing at the gateway, plus shared FHIR types from packages/fhir-domain.
5. PWA: register the service worker; cache the app shell; show OfflineBanner when offline.

Deliver a working login → empty dashboard that greets the user by role.
```

→ commit: `feat(web): design system, auth flow, role-aware shell, PWA base`

---

# PHASE 1 — Core record (M1 + M2 + M6) · covers 100% of patients

## P5 · M1 — Accueil & Identité (Patient + Coverage) + registration screen

```
Implement module M1 per CLAUDE.md §2 and the Patient payload model (identifier system https://hphii.ma/fhir/patient-id; zone-type, risk-group, coverage-scheme extensions).

BACKEND (modules/m1-accueil):
- POST /patients → create Patient (generate unique identifier; set extensions); returns 201 + Location.
- GET /patients/{id} and GET /patients?search (by identifier, name, zone, risk-group).
- POST /patients/{id}/coverage → create a Coverage resource (RAMED/AMO/Private) and a simulated eligibility check that returns active/inactive.
- All endpoints behind JwtAuthGuard + RolesGuard; reads/writes audited.

FRONTEND (one of the 5 priority screens — "patient registration"):
- A registration form: identity, birth year, residence area (Urban/Peri-urban/Rural), risk group, coverage scheme. On submit → create Patient + Coverage, show the generated FHIR id, run eligibility check.
- A patient search/list view.

Test end-to-end: register a rural chronic-risk patient and find them by identifier.
```

→ commit: `feat(m1): patient identity + coverage + registration UI`

## P6 · M2 — Triage (Encounter + Task) + triage screen

```
Implement module M2 per CLAUDE.md §2 and §8 (P1 auto-alert).

BACKEND (modules/m2-triage):
- POST /triage: input = patientId + vitals (BP, HR, glucose) + symptoms (severity).
  Run an algorithmic triage rule engine assigning a priority P1..P5 (document the rules; use the §7 thresholds and symptom severity). Create an Encounter (class emergency/ambulatory) + a Task carrying the priority.
- If priority = P1 (critical): auto-create a DetectedIssue (severity high) via the M4 alert service and send an SMS to the referring nurse (ConsoleSmsProvider for now).
- PUT /triage/{encounterId}: update priority/outcome (e.g. refer to external facility).
- Audited + RBAC (nurse can triage; physician can validate/override).

FRONTEND (priority screen — "algorithmic triage"):
- A triage form (vitals + symptoms) that shows the computed priority with the right color badge, the created Encounter/Task, and — for P1 — a visible critical-alert confirmation.
- A live queue of today's triaged encounters sorted by priority.

Test: a hypertensive-crisis input yields P1, creates the Encounter+Task+DetectedIssue, and logs an SMS.
```

→ commit: `feat(m2): algorithmic triage engine + P1 auto-alert + triage UI`

## P7 · M6 — DSP / SHR (role-filtered $everything + audit) + DSP viewer

```
Implement module M6 per CLAUDE.md §6 and §8 — this completes Phase 1.

BACKEND (modules/m6-dsp):
- GET /dsp/{patientId} → call FhirService.operationEverything, then FILTER the returned Bundle by the caller's role using the role→resource map in fhir-domain (Physician = full; Nurse = Patient+Observation+DetectedIssue; Lab-Technician = DiagnosticReport only; Pharmacist = MedicationRequest only; Admin = Patient+AuditEvent). Tag the Bundle with https://hphii.ma/fhir/rbac-filter.
- POST /dsp/{patientId}/documents → create a DocumentReference (e.g. an exported summary), respecting the "export" right in the §6 matrix.
- GET /dsp/{patientId}/audit → return the AuditEvent trail (admin/physician).
- Every access produces an AuditEvent (already via the interceptor) — verify it fires here.

FRONTEND (priority screen — "DSP consultation by role"):
- A patient record viewer that renders ONLY the sections the role is allowed to see, grouped by resource type, with timestamps. Show an explicit "filtered for role X" notice.
- An audit-trail panel (for allowed roles).

Test the same patient as Physician vs Lab-Technician and confirm the Bundles differ exactly per the matrix, and that each view created an AuditEvent.
```

→ commit: `feat(m6): role-filtered DSP access + DocumentReference + audit trail UI`

---

# PHASE 2 — Chronic pathway + monitoring (M3 + M4)

## P8 · M4 — Monitoring, alerts & 15-min escalation (FLAGSHIP) + dashboards

```
Implement module M4 per CLAUDE.md §7 and §8. This is the core clinical contribution. Type `plan` first.

BACKEND (modules/m4-monitoring + core/events + core/sms):
- POST /observations: create an Observation with the correct LOINC code + UCUM unit (CLAUDE.md §7), set interpretation.
- Threshold engine: on each Observation, compare to §7 thresholds. If breached, create a DetectedIssue:
  - severity per the table; DetectedIssue.status = "registered"; extension acknowledgement-status = "Pending".
  - Notify the referring clinician (SMS + in-app event).
  - Enqueue a BullMQ DELAYED job at 15 minutes ("escalation timer").
- PATCH /alerts/{id}/acknowledge: set status preliminary, acknowledgement-status = Acknowledged, and CANCEL the pending escalation job.
- PATCH /alerts/{id}/resolve: status final.
- Escalation worker: when the 15-min job fires and the alert is still Pending → set acknowledgement-status = Escalated, send an URGENT SMS to the SENIOR PHYSICIAN, emit an event. (escalated is NOT a FHIR status — only the extension changes; see CLAUDE.md §8.)
- HbA1c > 7 → emit a "CarePlan review needed" event for M3.
- Multi-channel notification abstraction (SMS now, in-app via SSE/websocket).

FRONTEND:
- Priority screen "monitoring dashboard with alerts": live list of active alerts with severity colors, countdown to escalation, Acknowledge/Resolve buttons, and a per-patient vitals trend chart (BP systolic/diastolic + glucose over time).
- Priority screen "patient SMS interface": a simple low-bandwidth view simulating a patient submitting a reading by SMS, which flows into the engine.

Test: submit BP systolic 170 → DetectedIssue(high, Pending) + SMS + 15-min job. Do NOT acknowledge → after the timer, status becomes Escalated + senior SMS. Then repeat and acknowledge within the window → no escalation.
```

→ commit: `feat(m4): LOINC monitoring + alert lifecycle + 15-min auto-escalation + dashboards`

## P9 · M3 — Parcours chronique & épisodique + pathway screen

```
Implement module M3 per CLAUDE.md §2 and the chronic/episodic bifurcation (cohort: ~43.7% chronic / ~45.4% episodic).

BACKEND (modules/m3-parcours):
- Chronic (M3a): POST /careplans (CarePlan with goals, activities, careTeam, linked Conditions/Flags), PUT to adjust, and an endpoint to close or switch a pathway. React to the M4 "CarePlan review needed" event by flagging the plan.
- Episodic (M3b): POST /episodes (Encounter + Condition for an acute episode), close episode, or "switch to chronic mode" (open a CarePlan from an episode).
- A GET /patients/{id}/pathway that returns whether the patient is chronic/episodic and the active plan/episode.
- Audited + RBAC.

FRONTEND (pathway screen):
- A patient pathway view that shows the bifurcation clearly: chronic side (CarePlan: goals, activities, monitoring summary, alerts) vs episodic side (current/past encounters + conditions), with actions to open/close/switch.

Test: open a chronic CarePlan for a diabetic patient; an HbA1c>7 event flags it for review; open an acute episode for another patient and switch it to chronic mode.
```

→ commit: `feat(m3): chronic CarePlan + episodic Encounter/Condition + pathway UI`

---

# PHASE 3 — Connected hospital services (M5)

## P10 · M5 — Pharmacy, Laboratory, Imaging + services screen

```
Implement module M5 per CLAUDE.md §2.

BACKEND (modules/m5-services):
- Pharmacy: POST /medication-requests (MedicationRequest with dosage), POST /medication-requests/{id}/validate (Pharmacist right per §6), a simulated stock/availability check.
- Laboratory & Imaging: POST /service-requests (ServiceRequest for Labo/Imagerie), POST /diagnostic-reports (Lab-Technician adds results; LOINC-coded; abnormal flag).
- On an abnormal DiagnosticReport → emit a notification event to the ordering physician (SMS + in-app).
- Audited + RBAC (only Lab-Technician adds results; only Physician/Pharmacist validate prescriptions).

FRONTEND:
- A services view per role: physician orders labs/meds; pharmacist sees a validation queue; lab technician enters results. Abnormal results surface a notification.

Test: physician orders an HbA1c; lab technician returns an abnormal result; physician receives the notification; physician prescribes a med; pharmacist validates it.
```

→ commit: `feat(m5): pharmacy + lab + imaging services with abnormal-result alerts + UI`

---

# Polish & hardening

## P11 · KPI dashboard (Balanced Scorecard)

```
Build an analytics dashboard (admin/physician) that computes the report's KPIs from LIVE FHIR data (and falls back to docs/kpis.json from the seeder).

Show: cohort size; chronic vs episodic split; triage distribution P1–P5 and % critical; monitoring volume and % abnormal; alert acknowledgement rate, % unacknowledged, % escalated; DSP access by role. Use simple, lightweight charts. Add a gateway endpoint GET /kpis that aggregates via FHIR search/_count where possible.
```

→ commit: `feat(analytics): live KPI / balanced-scorecard dashboard`

## P12 · Offline-first hardening, tests & docs

```
Finalize the PoC per CLAUDE.md §8 and §9.

1. Offline-first: in the web app, queue write operations (triage, observation submit) in IndexedDB when offline and replay on reconnect (PWA background sync); serve cached reads offline; make the relevant gateway writes idempotent (stable client-generated ids / upsert).
2. Tests: raise coverage on the security layer (RBAC matrix exhaustively, audit fires once per access), the M4 escalation timer (acknowledge vs timeout paths), and the M6 role-filtering. Add a couple of e2e flows (register→triage→DSP, and observation→alert→escalate).
3. Docs: docs/ARCHITECTURE.md (the layered diagram from the report in text + how it maps to folders), docs/API.md (the 12 FHIR endpoints + the auth endpoints), and a polished root README with a "demo script" (which seeded patient to open for each scenario).
4. Make `docker compose up -d` + seed + both apps a clean one-command-ish startup; document it.

Produce a final checklist confirming each module M1–M6 and each clinical/safety rule in CLAUDE.md §8 is satisfied.
```

→ commit: `chore: offline-first, tests, architecture & API docs, demo script`

---

## Suggested mapping to your DMAIC roadmap (for the report)

- **Phase 1 (P5–P7): M1 + M2 + M6** → 100% of patients (ID, triage traceability, RBAC DSP).
- **Phase 2 (P8–P9): M3 + M4** → the 33% chronic cohort (CarePlan + monitoring + escalation).
- **Phase 3 (P10): M5** → full medico-technical integration (paperless orders/results).

This mirrors the 3-phase deployment roadmap in your Chapter 3, so your prototype and your report tell the same story.
