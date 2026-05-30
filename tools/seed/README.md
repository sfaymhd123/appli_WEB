# HPHII SHR — cohort seeder (xlsx → FHIR R4 → HAPI)

Maps the empirical **371-patient** cohort workbook
(`data/Telehealth_Framework_Complete.xlsx`, 12 sheets) to FHIR R4 resources and
upserts them into the HAPI FHIR repository. Also computes the report KPIs and
writes them to `docs/kpis.json`.

> **PoC only.** Medication/lab payloads are placeholders — no real clinical or
> dosing logic. Clinical data lives in HAPI, never in the gateway DB.

## Prerequisites

- Python 3.11+ (tested on 3.14)
- HAPI FHIR up: `docker compose up -d hapi-fhir` (default `http://localhost:8080/fhir`)

```bash
cd tools/seed
pip install -r requirements.txt
```

## Usage

```bash
# Validate + print counts/KPIs + write docs/kpis.json, WITHOUT posting:
python seed.py --dry-run

# Seed for real:
python seed.py --xlsx ../../data/Telehealth_Framework_Complete.xlsx \
               --fhir-base http://localhost:8080/fhir
```

| Flag | Default | Purpose |
|---|---|---|
| `--xlsx` | `../../data/Telehealth_Framework_Complete.xlsx` | Source workbook |
| `--fhir-base` | `http://localhost:8080/fhir` | HAPI base URL |
| `--dry-run` | off | Build + validate + KPIs, no POST |
| `--batch-size` | `300` | Resources per FHIR transaction Bundle |
| `--kpis-out` | `../../docs/kpis.json` | KPI output path |

## Sheet → FHIR mapping

| Sheet | FHIR R4 resource(s) | id scheme |
|---|---|---|
| `Patients` | `Patient` (zone-type, risk-group extensions) | `pat-{patient_id}` |
| `Patient_Interactions` | *(lookup only: interaction → patient)* | — |
| `Pathway_Cases` | `CarePlan` (Chronic) / `Encounter` (Episodic) | `cp-` / `enc-{case_id}` |
| `Triage` | `Encounter` + `Task` (priority → P1–P5) | `enc-` / `task-{triage_id}` |
| `Symptom_Reports` | `Condition` (SNOMED CT) | `cond-{symptom_id}` |
| `Monitoring_Data` | `Observation` (LOINC + UCUM, interp. H) | `obs-{session_id}` |
| `Alerts` | `DetectedIssue` (+ acknowledgement-status ext) | `di-{alert_id}` |
| `Service_Orders` | `ServiceRequest` / `MedicationRequest` (Pharmacy) | `sr-` / `mr-{order_id}` |
| `Service_Results` | `DiagnosticReport` | `dr-{result_id}` |
| `SHR_Access_Log` | `AuditEvent` (IHE ATNA) | `ae-{access_id}` |

**Triage priority → P-level:** Critical→P1, High→P2, Medium→P3, Low→P4.
**Monitoring LOINC** (CLAUDE.md §7): Systolic `8480-6` (>140→H), Diastolic `8462-4`
(>90→H), Glucose `2339-0` (>126→H). **Alerts:** Critical→`high`, Warning→`moderate`;
status Pending/Acknowledged/Escalated via the `acknowledgement-status` extension
(`escalated` is not a valid FHIR `DetectedIssue.status`, so it is modelled as an
extension per CLAUDE.md §8).

## Idempotency

Every resource gets a **stable, source-derived id** and is written with **PUT**
inside FHIR **transaction Bundles**. Re-running upserts in place — counts never
grow (verified: 2nd run = `created=0 updated=17857`).

## KPIs

After a run the seeder prints and writes `docs/kpis.json`: chronic vs episodic
mix, monitoring volume, % abnormal results, alert acknowledgement rate
(incl. % unacknowledged), DSP access by role, and the triage priority mix.
