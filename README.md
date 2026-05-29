# HPHII Settat — Shared Health Record (SHR / DSP)

A working **proof-of-concept** of a modular Hospital Information System for **Hôpital
Provincial Hassan II de Settat**. It manages two patient pathways — **chronic** (CarePlan +
monitoring) and **episodic** (Encounter + triage) — and exposes a secure **Dossier de Santé
Partagé (DSP)**.

- **Standard:** HL7 **FHIR R4** (the gateway is a FHIR facade over HAPI FHIR).
- **Terminologies:** LOINC, SNOMED CT.
- **Constraints:** offline-first (rural patients) and an SMS channel.

> Academic PoC — **not production-ready**. Runs on a single laptop via Docker.
> Architecture is authoritative in [`CLAUDE.md`](./CLAUDE.md); build steps in
> [`CLAUDE_CODE_PROMPTS.md`](./CLAUDE_CODE_PROMPTS.md).

## Repository layout

```
.
├── docker-compose.yml          # hapi-fhir, postgres-hapi, postgres-gateway, redis
├── .env.example
├── apps/
│   ├── gateway/                # NestJS — API Gateway FHIR + modules M1..M6
│   └── web/                    # React + Vite + TS (PWA)
├── packages/
│   └── fhir-domain/            # shared TS: code systems, extension URLs, RBAC matrix, thresholds
├── tools/
│   └── seed/                   # Python xlsx → FHIR seeder + KPIs
├── docs/
└── data/                       # cohort xlsx (gitignored — PHI)
```

## Prerequisites

- **Node.js 20 LTS** (this machine has Node 24 — works, but is newer than the target).
- **Docker Desktop** (Compose v2+).
- **Python 3.11** for the seeder in `tools/seed` (this machine has 3.14).

## Quickstart

```bash
# 1) Infra: HAPI FHIR + Postgres x2 + Redis
cp .env.example .env          # Windows: copy .env.example .env
docker compose up -d

# 2) Install all workspaces (npm workspaces — one install at the root)
npm install

# 3) Gateway (NestJS) — http://localhost:3000  (health: /health)
npm run gateway:dev
#   or: cd apps/gateway && npm run start:dev

# 4) Web (React + Vite) — http://localhost:5173
npm run web:dev
#   or: cd apps/web && npm run dev
```

### Seed cohort data (xlsx → FHIR → HAPI)

```bash
cd tools/seed && pip install -r requirements.txt
python seed.py --xlsx ../../data/Telehealth_Framework_Complete.xlsx --fhir-base http://localhost:8080/fhir
```

## Default ports

| Service          | Port  |
|------------------|-------|
| HAPI FHIR        | 8080  |
| Gateway (NestJS) | 3000  |
| Web (Vite)       | 5173  |
| Redis            | 6379  |
| Postgres (gateway) | 5433 (host) |

## Auth keys (RS256)

The gateway signs JWTs with an RS256 key pair (paths in `.env`). Generate them locally:

```bash
mkdir secrets
openssl genrsa -out secrets/jwt-private.pem 2048
openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem
```

`secrets/` and `*.pem` are gitignored — keys are never committed.
