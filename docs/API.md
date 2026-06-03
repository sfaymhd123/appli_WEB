# API reference — HPHII SHR gateway

> Academic **proof-of-concept**. The gateway is a **FHIR R4 facade**: every
> endpoint below ultimately reads or writes FHIR resources in HAPI through the
> single `core/fhir/fhir.service.ts`. Base URL in development: `http://localhost:3000`.

## Conventions

- **Auth:** all routes require a `Bearer` access token **except** those marked
  **Public**. `Authorization: Bearer <accessToken>`.
- **Roles (§6):** `Physician`, `Nurse`, `Admin`, `Pharmacist`, `Lab-Technician`.
  Authorization is **deny-by-default**; a request whose role is not listed for a
  route gets **403**. A protected route with no/invalid token gets **401**.
- **Content type:** `application/json` for requests and responses.
- **Audit (§8):** every patient-scoped endpoint with an audit code (`C`/`R`/`U`/`E`)
  emits exactly **one** `AuditEvent` to HAPI (mirrored to gateway Postgres) on
  success. The code is noted per endpoint.
- **Idempotency (§8):** `POST /triage` and `POST /observations` accept an optional
  `clientRequestId`; a replayed write with the same id upserts instead of
  duplicating and **suppresses** one-shot side-effects (alert/SMS/timer). Such a
  response carries `deduplicated: true`.
- **Validation:** bodies are validated by a global `ValidationPipe` with
  `whitelist: true` (unknown properties are stripped) → **400** on violation.
- **PHI safety:** the gateway logs resource *types* and *ids* only — never names,
  vitals, or tokens.

## Endpoint summary

| # | Module | Method & path | Roles | Audit |
|---|---|---|---|---|
| — | Auth | `POST /auth/login` | Public | — |
| — | Auth | `POST /auth/mfa/verify` | Public | — |
| — | Auth | `POST /auth/refresh` | Public | — |
| — | Auth | `POST /auth/logout` | Public | — |
| — | Infra | `GET /health` | Public | — |
| — | Infra | `GET /fhir/metadata` | Public | — |
| 1 | M1 | `POST /patients` | Physician, Nurse, Admin | C |
| 2 | M1 | `GET /patients` | Physician, Nurse, Admin | — |
| 3 | M1 | `GET /patients/:id` | Physician, Nurse, Admin | R |
| 4 | M1 | `POST /patients/:id/coverage` | Physician, Nurse, Admin | C |
| 5 | M2 | `POST /triage` | Nurse, Physician | C |
| 6 | M2 | `GET /triage/queue` | Nurse, Physician | — |
| 7 | M2 | `PUT /triage/:encounterId` | Physician | U |
| 8 | M3 | `POST /careplans` | Physician, Nurse | C |
| 9 | M3 | `PUT /careplans/:carePlanId` | Physician, Nurse | U |
| 10 | M3 | `POST /careplans/:carePlanId/close` | Physician | U |
| 11 | M3 | `POST /careplans/:carePlanId/review/acknowledge` | Physician, Nurse | U |
| 12 | M3 | `POST /episodes` | Physician, Nurse | C |
| 13 | M3 | `POST /episodes/:episodeId/close` | Physician, Nurse | U |
| 14 | M3 | `POST /episodes/:episodeId/switch-to-chronic` | Physician | C |
| 15 | M3 | `GET /patients/:patientId/pathway` | Physician, Nurse | R |
| 16 | M4 | `POST /observations` | Nurse, Physician | C |
| 17 | M4 | `GET /alerts` | Nurse, Physician | — |
| 18 | M4 | `GET /alerts/notifications` | Nurse, Physician | — |
| 19 | M4 | `PATCH /alerts/:alertId/acknowledge` | Nurse, Physician | U |
| 20 | M4 | `PATCH /alerts/:alertId/resolve` | Nurse, Physician | U |
| 21 | M4 | `GET /patients/:patientId/vitals` | Nurse, Physician | R |
| — | M4 | `GET /alerts/stream` (SSE) | Public (token query param) | — |
| 22 | M5 | `POST /medication-requests` | Physician | C |
| 23 | M5 | `POST /medication-requests/:id/validate` | Physician, Pharmacist | U |
| 24 | M5 | `GET /medication-requests` | Physician, Pharmacist | — |
| 25 | M5 | `POST /service-requests` | Physician | C |
| 26 | M5 | `GET /service-requests` | Physician, Lab-Technician | — |
| 27 | M5 | `POST /diagnostic-reports` | Lab-Technician | C |
| 28 | M5 | `GET /diagnostic-reports` | Physician, Lab-Technician | — |
| 29 | M5 | `GET /services/notifications` | Physician | — |
| 30 | M6 | `GET /dsp/:patientId` | per §6 action `read_record` | R |
| 31 | M6 | `POST /dsp/:patientId/documents` | per §6 action `export_record` | E |
| 32 | M6 | `GET /dsp/:patientId/audit` | Admin, Physician | R |
| 33 | Analytics | `GET /kpis` | Admin, Physician | — |

---

## Auth & session (Public)

OAuth2 password grant + JWT (RS256), with optional TOTP MFA. Seeded users share
the PoC password (`SEED_PASSWORD`, default `Passw0rd!`) and have MFA disabled.

### `POST /auth/login`
Body: `{ "email": "medecin@hphii.ma", "password": "Passw0rd!" }`
- MFA disabled → `200 { accessToken, refreshToken, user }`.
- MFA enabled → `200 { mfaRequired: true, mfaToken }` (then call `/auth/mfa/verify`).

### `POST /auth/mfa/verify`
Body: `{ "mfaToken": "...", "code": "123456" }` → `200 { accessToken, refreshToken, user }`.

### `POST /auth/refresh`
Body: `{ "refreshToken": "..." }` → `200 { accessToken, refreshToken }`.

### `POST /auth/logout`
Body: `{ "refreshToken": "..." }` → `200`. Revokes the refresh token.

---

## Infra (Public)

### `GET /health`
Liveness probe → `200 { status: "ok", ... }`.

### `GET /fhir/metadata`
Passthrough to HAPI's `CapabilityStatement` — confirms gateway↔HAPI connectivity.

---

## M1 — Accueil & Identité  (`Patient`, `Coverage`)

### 1. `POST /patients`  · Audit `C` · 201
Register a patient. Mints the HPHII identifier and stores zone/risk extensions (§5).
```json
{
  "firstName": "Amina", "lastName": "Bennani",
  "gender": "female", "birthYear": 1972,
  "zoneType": "Rural", "riskGroup": "Chronic-risk",
  "phone": "+212600000000"
}
```
Returns the created `Patient`.

### 2. `GET /patients`
List/search. Optional query (AND-combined): `identifier`, `name`, `zone`, `riskGroup`.
Returns a list of patient summaries.

### 3. `GET /patients/:id`  · Audit `R`
Returns the `Patient`.

### 4. `POST /patients/:id/coverage`  · Audit `C` · 201
Attach RAMED / AMO / Private coverage.
```json
{ "scheme": "RAMED", "memberId": "optional-payer-id" }
```
Returns the created `Coverage`.

---

## M2 — Triage  (`Encounter`, `Task`)

### 5. `POST /triage`  · Audit `C` · 201
Run algorithmic triage (5 levels P1–P5). Creates an `Encounter` + routing `Task`;
**P1 (critical)** auto-creates a `DetectedIssue` (severity high) + SMS to the
referring nurse (§8). Supports idempotent replay via `clientRequestId`.
```json
{
  "patientId": "pat-1",
  "systolicBp": 160, "diastolicBp": 95, "heartRate": 88, "glucose": 130,
  "symptomSeverity": "critical",
  "complaint": "optional generic text",
  "clientRequestId": "optional-stable-uuid"
}
```
Returns `{ priority, critical, encounter, task, alert?, deduplicated? }`.

### 6. `GET /triage/queue`
Returns the current triage worklist (open encounters/tasks, priority-ordered).

### 7. `PUT /triage/:encounterId`  · Audit `U` · Physician only
Clinician override/validation of a triage decision.
```json
{ "priority": "P2", "outcome": "referred-external", "referralFacility": "CHU Casablanca" }
```
Returns the updated `Encounter`.

---

## M3 — Parcours chronique (M3a) & épisodique (M3b)  (`CarePlan`, `Condition`, `Encounter`)

### 8. `POST /careplans`  · Audit `C` · 201
Open a chronic care plan with linked Conditions, Goals, activities and an optional CareTeam.
```json
{
  "patientId": "pat-1",
  "title": "Plan diabète", "description": "...",
  "conditions": [{ "display": "Type 2 diabetes", "code": "44054006", "system": "http://snomed.info/sct" }],
  "goals": ["HbA1c < 7%"],
  "activities": [{ "description": "Monthly fasting glucose", "status": "scheduled" }],
  "careTeam": [{ "name": "Dr X", "role": "Endocrinologue" }]
}
```
Returns `{ carePlan, conditions, goals, careTeam }`.

### 9. `PUT /careplans/:carePlanId`  · Audit `U`
Adjust title/description/status/activities/goals. Returns the updated `CarePlan`.

### 10. `POST /careplans/:carePlanId/close`  · Audit `U` · Physician only
Body: `{ "reason": "...", "cancelled": false }` → `revoked` (cancelled) or `completed`.

### 11. `POST /careplans/:carePlanId/review/acknowledge`  · Audit `U`
Clear a pending review marker raised by M4 (HbA1c > 7, §7). Returns the `CarePlan`.

### 12. `POST /episodes`  · Audit `C` · 201
Open an acute episode (`Encounter` + diagnosis Conditions).
```json
{ "patientId": "pat-1", "complaint": "...", "emergency": true,
  "conditions": [{ "display": "Chest pain", "code": "29857009" }] }
```

### 13. `POST /episodes/:episodeId/close`  · Audit `U`
Body: `{ "reason": "...", "cancelled": false }` → `cancelled` or `finished`.

### 14. `POST /episodes/:episodeId/switch-to-chronic`  · Audit `C` · 201 · Physician only
Convert an episode into a chronic `CarePlan` addressing its Conditions.
```json
{ "title": "...", "goals": ["..."], "closeEpisode": true }
```
Returns the new `CarePlan`.

### 15. `GET /patients/:patientId/pathway`  · Audit `R`
Chronic/episodic classification + active plan/episode + history for a patient.

---

## M4 — Monitoring & Alertes  (`Observation`, `DetectedIssue`)

### 16. `POST /observations`  · Audit `C` · 201
Submit one measured value. The `metric` key selects the LOINC code + UCUM unit; the
value is compared to §7 thresholds. A breach creates a `DetectedIssue` (severity per
§7) with `acknowledgement-status = Pending` and **arms the 15-minute escalation
timer** (BullMQ). HbA1c > 7 raises a CarePlan-review marker. Supports idempotent
replay via `clientRequestId`.
```json
{
  "patientId": "pat-1",
  "metric": "systolic-bp",
  "value": 160,
  "source": "sms",
  "effectiveDateTime": "2026-05-31T09:00:00+01:00",
  "clientRequestId": "optional-stable-uuid"
}
```
Returns `{ breached, severity, observation, alert?, deduplicated? }`.
Metric keys come from §7 (e.g. `systolic-bp`, `diastolic-bp`, `fasting-glucose`,
`post-prandial-glucose`, `hba1c`, `heart-rate`, `serum-creatinine`).

### 17. `GET /alerts`
List `DetectedIssue` alerts (optionally filtered by status); shows acknowledgement state.

### 18. `GET /alerts/notifications`
Recent alert events for in-app polling fallback.

### 19. `PATCH /alerts/:alertId/acknowledge`  · Audit `U`
Acknowledge an alert → FHIR `status: preliminary`, `acknowledgement-status = Acknowledged`;
**cancels** the escalation timer (§8). Optional body `{ "note": "..." }`.

### 20. `PATCH /alerts/:alertId/resolve`  · Audit `U`
Resolve an alert → FHIR `status: final`. Optional body `{ "note": "..." }`.

### 21. `GET /patients/:patientId/vitals`  · Audit `R`
Time-series of a patient's observations for the monitoring dashboard.

### `GET /alerts/stream`  (SSE, Public via `?token=`)
Server-Sent Events stream of in-app notifications. `EventSource` cannot send an
`Authorization` header, so the access token is passed as `?token=<accessToken>` and
verified with the same RS256 keys/issuer as the bearer guard.

> **Escalation (§8, flagship):** if a `high`/`critical` alert is not acknowledged
> within `ALERT_ESCALATION_MINUTES` (default 15), the BullMQ job sets
> `acknowledgement-status = Escalated` (not a FHIR status) and notifies the senior
> physician via SMS + in-app. No alert is ever silently lost.

---

## M5 — Services médico-techniques  (`MedicationRequest`, `ServiceRequest`, `DiagnosticReport`)

### 22. `POST /medication-requests`  · Audit `C` · 201 · Physician only
Order a medication → `draft`/`order` `MedicationRequest` awaiting pharmacist validation.
```json
{ "patientId": "pat-1", "medication": "Metformine", "code": "optional", "system": "optional",
  "dosageInstruction": "500 mg x2/j", "quantity": 60, "quantityUnit": "comprimé", "note": "..." }
```
> PoC: medication is free-text — no validated drug dictionary or dosing logic.

### 23. `POST /medication-requests/:id/validate`  · Audit `U` · Physician, Pharmacist
Approve (→ `active`) or reject (→ `cancelled`) a draft prescription (§6).
```json
{ "decision": "approve", "note": "optional reason" }
```

### 24. `GET /medication-requests`
List prescriptions; `?status=draft` drives the pharmacist validation queue.

### 25. `POST /service-requests`  · Audit `C` · 201 · Physician only
Order a laboratory or imaging study → `active`/`order` `ServiceRequest`.
```json
{ "patientId": "pat-1", "category": "Laboratory", "display": "HbA1c", "loinc": "4548-4",
  "priority": "routine", "note": "..." }
```

### 26. `GET /service-requests`
List service orders; `?status=active` drives the lab technician worklist.

### 27. `POST /diagnostic-reports`  · Audit `C` · 201 · Lab-Technician only
Record a result → `Observation` + `DiagnosticReport` (§6 "add biological result").
Supply a numeric `value` (+`unit`) and/or textual `valueText`; abnormality is derived
from §7 thresholds when not given explicitly.
```json
{ "patientId": "pat-1", "serviceRequestId": "sr-12", "category": "Laboratory",
  "loinc": "4548-4", "display": "HbA1c", "value": 8.1, "unit": "%",
  "abnormal": true, "conclusion": "..." }
```

### 28. `GET /diagnostic-reports`
List diagnostic reports (most-recent first).

### 29. `GET /services/notifications`
Recent abnormal-result events for the ordering physician (polling fallback).

---

## M6 — DSP / SHR  (`DocumentReference`, `AuditEvent`)

### 30. `GET /dsp/:patientId`  · Audit `R` · §6 action `read_record`
Role-filtered `Patient/{id}/$everything`. The gateway fetches one HAPI bundle and
trims it per JWT role (§6) — never duplicating clinical data — and tags the bundle
with `rbac-filter`:

| Role | Resources returned |
|---|---|
| Physician | Patient + CarePlan + Observation + DetectedIssue + DocumentReference |
| Nurse | Patient + Observation + DetectedIssue |
| Lab-Technician | DiagnosticReport only |
| Pharmacist | MedicationRequest only |
| Admin | Patient + AuditEvent |

### 31. `POST /dsp/:patientId/documents`  · Audit `E` · §6 action `export_record` (Physician, Admin)
Generate an exported-summary `DocumentReference`. All fields optional (PoC defaults applied).
```json
{ "title": "Résumé DSP", "description": "...", "contentText": "plain-text body" }
```
Returns the created `DocumentReference`.

### 32. `GET /dsp/:patientId/audit`  · Audit `R` · Admin, Physician
Returns the patient's `AuditEvent` trail (the §8 access log).

---

## Analytics

### 33. `GET /kpis`  · Admin, Physician
Balanced-scorecard KPIs computed live from FHIR (falls back to `docs/kpis.json`).
Aggregate, non-patient-specific → intentionally **not** audited.
