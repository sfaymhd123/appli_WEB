# Demo video scenario — HPHII Shared Health Record (SHR / DSP)

A recording-ready walkthrough of the PoC. It follows **one patient** through all six
modules (M1→M6) and lands on the flagship **15-minute escalation**. Designed for a
**~8-minute** video (+1 min optional offline segment).

> Companion to the short script in [`README.md`](./README.md#demo-script-scenario-walkthrough).
> Architecture / rules referenced as §x live in [`ARCH.md`](./ARCH.md) / `CLAUDE.md`.

---

## 0 · Pre-flight (before you hit record)

1. **Make the escalation observable.** In `.env`, set a short timer and **restart the gateway**:
   ```
   ALERT_ESCALATION_SECONDS=45
   ```
   (Default is the real 15-minute timer — too long for a video.)
2. **Launch everything:** `npm run dev:up` (infra → migrate → seed users → cohort → both apps).
3. **Two windows side by side:**
   - Left: browser at `http://localhost:5173`
   - Right: the **gateway terminal** — `ConsoleSmsProvider` prints every SMS here. Showing the
     SMS appear live is your proof shot.
4. **Browser hygiene:** zoom ~110%, hide the bookmarks bar, close other tabs.

### Logins (all roles share the PoC password `Passw0rd!`, MFA off)

| Role | Email |
|---|---|
| Physician (Médecin) | `medecin@hphii.ma` |
| Nurse (Infirmier) | `nurse@hphii.ma` |
| Admin | `admin@hphii.ma` |
| Pharmacist (Pharmacien) | `pharmacist@hphii.ma` |
| Lab-Technician (Laborantin) | `lab@hphii.ma` |

### The story

*Fatima Zahra, 58, hypertensive + type-2 diabetic, rural zone, RAMED coverage.* She arrives
critical, is triaged P1, gets a care plan and prescriptions, her blood pressure spikes during
monitoring, and the unacknowledged alert escalates to a senior physician — while we see how each
role sees a different slice of her record.

---

## 1 · The fastest path — one click, then narrate (recommended)

On the **dashboard** (logged in as **Nurse** or **Physician**) there's a
**“Démonstration — scénario en un clic”** card. Click **“Lancer le scénario.”**

In one click the backend builds Fatima's whole journey through the **real RBAC + audit
pipeline** (each step runs as the correct role):

> register → RAMED coverage → **P1 triage** (alert raised, then acknowledged) → chronic
> **CarePlan** (HTA + diabète) → **prescription** ordered *and* pharmacist-validated → **lab**
> ordered *and* lab result posted (HbA1c 8.1 %) → **DSP document** → **systolic BP 185 mmHg →
> high alert left Pending**.

You're dropped on **/alerts** with one fresh **Pending** high alert. Now just **narrate the
views** (Scenes below) and let the alert **escalate live** (~45 s).

> Each click creates a **new** "Fatima Zahra" — if you re-run, use the most recent patient id
> (shown in the success toast).

*(Prefer a fully manual demo? Skip this card and do every step by hand — Scenes 2–6 are written
so they work either way.)*

---

## 2 · Login & the security story  (~40 s)
- **Log in as:** Nurse.
- **Say:** *"Everything is HL7 FHIR R4. The gateway is a FHIR facade with OAuth2 + JWT and
  role-based access — five roles, deny-by-default. As a nurse, my menu only shows what a nurse
  may touch."*
- **Notice:** the navigation is already filtered by role (no Analytics/Audit for a nurse).

## 3 · Register → P1 triage (M1 + M2) · **SMS #1**  (~90 s)
- **Patients → New** → register Fatima; note the new `pat-…` id. Then **Triage** with
  `symptomSeverity = critical`.
- **Say:** *"Registration mints a FHIR Patient with RAMED/AMO coverage. Triage runs a 5-level
  algorithm — a critical symptom gives priority P1."*
- **Notice:** result is **P1**; glance right — an **SMS to the referring nurse** is logged and a
  high-severity `DetectedIssue` was auto-created. *"No P1 is ever silent."*

## 4 · Monitoring alert → 15-min escalation (M4) · **SMS #2** · ⭐ FLAGSHIP  (~120 s)
- As **Nurse**, open **Monitoring / Observations**; submit `systolic-bp = 185`.
- **Say:** *"185 is well over the threshold, so the engine raises a high-severity alert and arms
  a 15-minute escalation timer."*
- **Notice:** the alert appears **Pending** under **Alerts**. **Wait ~45 s doing nothing** (talk
  over it). It flips to **`Escalated`** and the right terminal logs a **senior-physician SMS**.
- **Say:** *"Nobody acknowledged it, so a background job escalated it and notified the senior
  physician. This is the flagship safety rule — an alert is never lost."*
- *(Happy-path retake: submit another, click **Acknowledge** within the window → timer cancels,
  status `Acknowledged`.)*

> If you used the one-click card, the alert is already Pending on /alerts — just wait for the flip.

## 5 · Chronic pathway + service orders (M3 + M5)  (~90 s)
- As **Physician**, open Fatima's **Pathway** → create a chronic **CarePlan** (hypertension +
  diabetes, a goal). Then **Services** → order a medication.
- Switch to **Pharmacist** → **Services** → **validate** the prescription from the queue.
- *(Optional)* Switch to **Lab-Technician** → post a **DiagnosticReport** for the lab order.
- **Say:** *"The physician plans long-term care and orders meds; the pharmacist validates from
  their own queue; the lab technician posts results. Same FHIR resources, different role views —
  that's the §6 RBAC matrix."*

## 6 · Role-filtered DSP + audit trail (M6) · the privacy highlight  (~90 s)
- As **Physician**, open Fatima's **DSP** → full record (Patient + CarePlan + Observations +
  DetectedIssue + Documents).
- Switch to **Nurse** → open the *same* DSP → only **Patient + Observation + DetectedIssue**.
- **Say:** *"Both views come from one HAPI `$everything` call, trimmed at the gateway by JWT
  role. We never duplicate clinical data per role."*
- Log in as **Admin** → **Audit** → **one `AuditEvent` per access** (actor, action, resource,
  time). *"Every DSP access is audited — IHE ATNA. No exceptions."*

## 7 · Analytics / KPIs  (~45 s)
- As **Admin** or **Physician**, open **Analytics** → balanced-scorecard KPIs computed live from
  FHIR (pathway mix, alert-acknowledgement rate, triage distribution, DSP access by role).

## 8 · Offline-first PWA (optional, ~60 s)
- DevTools → Network → **Offline**. Submit a triage or observation → offline banner + queued in
  IndexedDB. Flip back **Online** → the queue replays automatically.
- **Say:** *"~45 % of patients are rural. Writes queue locally and replay on reconnect — and
  because each carries a stable request id, the replay upserts: no duplicate records, and the
  alert/SMS/timer never fires twice."*

## 9 · Closing  (~20 s)
*"FHIR R4 end to end, six modules, a role-filtered shared health record with full audit, a
never-lose-an-alert escalation engine, and offline-first for rural care — all laptop-runnable via
Docker."*

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Alert never escalates on camera | `ALERT_ESCALATION_SECONDS` not set (or 0) → it's on the 15-min default. Set it and **restart the gateway**. |
| One-click card not visible | It shows in dev (`npm run web:dev`). For a production build set `VITE_ENABLE_DEMO=true`. |
| `/alerts` redirects you away | Alerts are Nurse/Physician only. Log in as one of them (other roles are sent to the patient's DSP). |
| Escalation flips but no SMS in terminal | The SMS is logged by the gateway process — make sure that terminal is the one showing gateway logs. |
| Re-running made several "Fatima Zahra" | Expected (no dedup). Use the newest patient id from the toast. |
