#!/usr/bin/env node
/**
 * One-command(-ish) dev startup for the HPHII SHR PoC.
 *
 *   node scripts/dev-up.mjs              # infra → wait HAPI → db migrate+seed → cohort (if possible) → both apps
 *   node scripts/dev-up.mjs --no-apps    # stop after seeding (CI / "just set me up")
 *   node scripts/dev-up.mjs --no-cohort  # skip the Python cohort seed (users still seeded)
 *   node scripts/dev-up.mjs --no-infra   # assume docker compose is already up
 *
 * Pure Node (ESM, no extra deps) so it runs anywhere Node 20+ is installed —
 * which is guaranteed, since Node is the gateway runtime. Cross-platform:
 * everything is spawned with shell:true so `npm`/`docker` resolve on Windows too.
 *
 * It is deliberately idempotent: HAPI seeding uses PUT (stable ids), the user
 * seed upserts, and `prisma migrate deploy` only applies pending migrations — so
 * re-running never duplicates state. PoC only; not a production launcher.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const want = { infra: !args.has('--no-infra'), apps: !args.has('--no-apps'), cohort: !args.has('--no-cohort') };

/* ---- tiny .env reader (only the few keys we need; no dotenv dependency) ---- */
function readEnv() {
  const out = {};
  const file = join(repoRoot, '.env');
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = readEnv();
const HAPI_BASE = process.env.HAPI_FHIR_BASE_URL || env.HAPI_FHIR_BASE_URL || 'http://localhost:8080/fhir';
const GATEWAY_DB = process.env.GATEWAY_DATABASE_URL || env.GATEWAY_DATABASE_URL || 'postgresql://gateway:gateway@localhost:5433/gateway';
const dbPort = Number(/:(\d+)\//.exec(GATEWAY_DB)?.[1] ?? 5433);

/* ---- small helpers ---- */
const log = (msg) => process.stdout.write(`\n==> ${msg}\n`);
const warn = (msg) => process.stdout.write(`  ! ${msg}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run a command to completion; reject on non-zero exit. */
function run(cmd, { cwd = repoRoot, optional = false } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(cmd, { cwd, shell: true, stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0 ? resolveRun() : optional ? resolveRun(code) : reject(new Error(`\`${cmd}\` exited ${code}`)),
    );
    child.on('error', (e) => (optional ? resolveRun(1) : reject(e)));
  });
}

/** Poll an HTTP endpoint until it answers < 500. */
async function waitHttp(url, label, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  process.stdout.write(`  waiting for ${label} (${url}) `);
  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.status < 500) {
        process.stdout.write(' up\n');
        return;
      }
    } catch {
      /* not ready yet */
    }
    if (Date.now() > deadline) throw new Error(`${label} not ready after ${timeoutMs / 1000}s`);
    process.stdout.write('.');
    await sleep(2500);
  }
}

/** Poll a TCP port until it accepts a connection. */
async function waitTcp(port, label, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  process.stdout.write(`  waiting for ${label} (tcp :${port}) `);
  for (;;) {
    const ok = await new Promise((res) => {
      const sock = net.connect({ port, host: '127.0.0.1' }, () => {
        sock.destroy();
        res(true);
      });
      sock.on('error', () => res(false));
      sock.setTimeout(3000, () => {
        sock.destroy();
        res(false);
      });
    });
    if (ok) {
      process.stdout.write(' up\n');
      return;
    }
    if (Date.now() > deadline) throw new Error(`${label} not ready after ${timeoutMs / 1000}s`);
    process.stdout.write('.');
    await sleep(2000);
  }
}

/** Find a usable Python interpreter, or null. */
async function findPython() {
  for (const exe of ['python', 'python3', 'py']) {
    const ok = await run(`${exe} --version`, { optional: true })
      .then((code) => code === undefined || code === 0)
      .catch(() => false);
    if (ok) return exe;
  }
  return null;
}

/** Start gateway + web together; stream both, exit cleanly on Ctrl-C. */
function startApps() {
  log('Starting gateway (:3000) and web (:5173) — Ctrl-C to stop both');
  const children = [
    spawn('npm run gateway:dev', { cwd: repoRoot, shell: true, stdio: 'inherit' }),
    spawn('npm run web:dev', { cwd: repoRoot, shell: true, stdio: 'inherit' }),
  ];
  const killAll = () => children.forEach((c) => !c.killed && c.kill());
  process.on('SIGINT', killAll);
  process.on('SIGTERM', killAll);
  children.forEach((c) => c.on('exit', killAll));
}

/* ---- orchestration ---- */
async function main() {
  if (!existsSync(join(repoRoot, '.env'))) {
    warn('No .env found at repo root. Copy it first: `cp .env.example .env` (Windows: `copy .env.example .env`).');
  }

  if (want.infra) {
    log('1/5 Starting infra (HAPI FHIR + Postgres x2 + Redis)');
    await run('docker compose up -d');
  } else {
    warn('Skipping infra (--no-infra).');
  }

  log('2/5 Waiting for services to be ready');
  await waitTcp(dbPort, 'gateway Postgres');
  await waitHttp(`${HAPI_BASE}/metadata`, 'HAPI FHIR');

  log('3/5 Gateway DB: generate client + apply migrations');
  await run('npm run prisma:generate --workspace @hphii/gateway');
  await run('npm run prisma:deploy --workspace @hphii/gateway');

  log('4/5 Seeding gateway users (one per RBAC role)');
  await run('npm run db:seed --workspace @hphii/gateway');

  if (want.cohort) {
    const xlsx = join(repoRoot, 'data', 'Telehealth_Framework_Complete.xlsx');
    const py = await findPython();
    if (!py) {
      warn('5/5 Cohort seed skipped: no Python interpreter found. See tools/seed/README.md.');
    } else if (!existsSync(xlsx)) {
      warn('5/5 Cohort seed skipped: dataset not found at data/ (PHI, gitignored). Place the xlsx then run `npm run seed:cohort`.');
    } else {
      log('5/5 Seeding 371-patient cohort into HAPI (xlsx → FHIR)');
      const seedDir = join(repoRoot, 'tools', 'seed');
      await run(`${py} -m pip install -r requirements.txt`, { cwd: seedDir, optional: true });
      await run(`${py} seed.py --xlsx "${xlsx}" --fhir-base ${HAPI_BASE}`, { cwd: seedDir, optional: true });
    }
  } else {
    warn('5/5 Cohort seed skipped (--no-cohort).');
  }

  if (want.apps) startApps();
  else log('Setup complete (--no-apps). Start the apps with: npm run gateway:dev  &  npm run web:dev');
}

main().catch((err) => {
  process.stderr.write(`\n✗ ${err.message}\n`);
  process.exitCode = 1;
});
