import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance, isAxiosError } from 'axios';
import {
  CoverageScheme,
  RiskGroup,
  Role,
  ServiceCategory,
  ZoneType,
} from '@hphii/fhir-domain';

import type { AppConfig } from '../../core/config/configuration';
import type { DemoRunResult, DemoStep } from './demo.types';

/** Seed user email per role — mirrors apps/gateway/prisma/seed.ts. */
const SEED_EMAILS: Record<string, string> = {
  [Role.NURSE]: 'nurse@hphii.ma',
  [Role.PHYSICIAN]: 'medecin@hphii.ma',
  [Role.PHARMACIST]: 'pharmacist@hphii.ma',
  [Role.LAB_TECHNICIAN]: 'lab@hphii.ma',
};

type HttpMethod = 'get' | 'post' | 'patch' | 'put';

/**
 * One-click demo seeder. Drives the gateway's **own** HTTP API as each RBAC
 * role to build a complete, realistic patient journey (M1→M6) in one call —
 * register → P1 triage → chronic CarePlan → prescription (ordered + validated)
 * → lab order + result → DSP document → breaching observation (Pending alert).
 *
 * It calls the real endpoints over HTTP (not the services directly), so the
 * genuine auth + RBAC + audit pipeline runs for every step (ARCH.md §11 — nothing
 * is bypassed). The breaching observation is intentionally left **Pending** so the
 * 15-min escalation timer fires live during a recording (§8). Dev-only: refuses
 * to run when NODE_ENV=production. NOT a clinical feature.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  private readonly http: AxiosInstance;
  private readonly seedPassword: string;
  private readonly isProduction: boolean;

  constructor(config: ConfigService<AppConfig, true>) {
    this.http = axios.create({
      baseURL: config.get('selfBaseUrl', { infer: true }),
      timeout: 20_000,
    });
    this.seedPassword = config.get('seedPassword', { infer: true });
    this.isProduction = config.get('nodeEnv', { infer: true }) === 'production';
  }

  async runScenario(): Promise<DemoRunResult> {
    if (this.isProduction) {
      throw new HttpException('Demo seeding is disabled in production', HttpStatus.FORBIDDEN);
    }

    const steps: DemoStep[] = [];
    const tokens = new Map<string, string>();
    const patientName = 'Fatima Zahra';
    let patientId = '';
    let alertId: string | undefined;

    /** Log in as a role once and cache the access token for the run. */
    const tokenFor = async (role: string): Promise<string> => {
      const cached = tokens.get(role);
      if (cached) return cached;
      const { data } = await this.http.post<{ access_token?: string }>('/auth/login', {
        email: SEED_EMAILS[role],
        password: this.seedPassword,
      });
      const token = data.access_token;
      if (!token) {
        throw new Error(`login for ${role} returned no access_token (is MFA enabled on the seed user?)`);
      }
      tokens.set(role, token);
      return token;
    };

    /** Authenticated call as the given role. */
    const call = async <T>(role: string, method: HttpMethod, url: string, body?: unknown): Promise<T> => {
      const token = await tokenFor(role);
      const { data } = await this.http.request<T>({
        method,
        url,
        data: body,
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    };

    /** Run one labelled step; record it and abort the run on failure. */
    const step = async <T>(key: string, label: string, fn: () => Promise<T>): Promise<T> => {
      try {
        const result = await fn();
        steps.push({ key, label, ok: true });
        return result;
      } catch (err) {
        const detail = describe(err);
        steps.push({ key, label, ok: false, detail });
        this.logger.error(`Demo step '${key}' failed: ${detail}`);
        throw new HttpException(
          { message: `Étape « ${label} » échouée : ${detail}`, failedStep: key, steps, patientId },
          HttpStatus.BAD_GATEWAY,
        );
      }
    };

    const currentYear = new Date().getFullYear();

    // 1 · M1 — register the patient (Nurse).
    const patient = await step('register', 'Inscription de la patiente', () =>
      call<{ id: string }>(Role.NURSE, 'post', '/patients', {
        firstName: 'Fatima',
        lastName: 'Zahra',
        gender: 'female',
        birthYear: currentYear - 58,
        zoneType: ZoneType.RURAL,
        riskGroup: RiskGroup.CHRONIC_RISK,
        phone: '+212600000010',
      }),
    );
    patientId = patient.id;

    // 2 · M1 — attach RAMED coverage (Nurse).
    await step('coverage', 'Couverture RAMED', () =>
      call(Role.NURSE, 'post', `/patients/${patientId}/coverage`, { scheme: CoverageScheme.RAMED }),
    );

    // 3 · M2 — P1 (critical) triage (Nurse) → DetectedIssue + SMS to the referring nurse (§8).
    const triage = await step('triage', 'Triage P1 (critique)', () =>
      call<{ alert?: { detectedIssue?: { id?: string } } }>(Role.NURSE, 'post', '/triage', {
        patientId,
        systolicBp: 172,
        diastolicBp: 98,
        heartRate: 96,
        glucose: 180,
        symptomSeverity: 'critical',
        complaint: 'Céphalées intenses + douleur thoracique',
      }),
    );

    // 3b · M4 — acknowledge the P1 triage alert (Nurse) so it stops escalating: this
    // leaves the *monitoring* alert (step 10) as the single Pending one to watch
    // flip live, and demonstrates the acknowledge flow (§8). Best-effort.
    const triageAlertId = triage.alert?.detectedIssue?.id;
    if (triageAlertId) {
      await step('ack-triage', 'Acquittement de l’alerte de triage', () =>
        call(Role.NURSE, 'patch', `/alerts/${triageAlertId}/acknowledge`, {
          note: 'Prise en charge à l’accueil',
        }),
      );
    }

    // 4 · M3 — open a chronic CarePlan (Physician).
    await step('careplan', 'Plan de soins chronique (HTA + diabète)', () =>
      call(Role.PHYSICIAN, 'post', '/careplans', {
        patientId,
        title: 'Plan de soins — HTA & diabète type 2',
        description: 'Suivi longitudinal de l’hypertension et du diabète (démo PoC).',
        conditions: [
          { display: 'Hypertension artérielle essentielle', code: '59621000', system: 'http://snomed.info/sct' },
          { display: 'Diabète sucré de type 2', code: '44054006', system: 'http://snomed.info/sct' },
        ],
        goals: ['TA < 140/90 mmHg', 'HbA1c < 7%'],
        activities: [
          { description: 'Auto-mesure tensionnelle hebdomadaire', status: 'scheduled' },
          { description: 'Contrôle HbA1c trimestriel', status: 'scheduled' },
        ],
        careTeam: [{ name: 'Dr. Alaoui', role: 'Médecin traitant' }],
      }),
    );

    // 5 · M5 — order a medication (Physician) → draft awaiting validation.
    const med = await step('med-order', 'Prescription d’Amlodipine', () =>
      call<{ medicationRequest?: { id?: string } }>(Role.PHYSICIAN, 'post', '/medication-requests', {
        patientId,
        medication: 'Amlodipine',
        dosageInstruction: '5 mg — 1 comprimé par jour',
        quantity: 30,
        quantityUnit: 'comprimé',
        priority: 'routine',
      }),
    );

    // 6 · M5 — Pharmacist validates the prescription (§6).
    const medId = med.medicationRequest?.id;
    if (medId) {
      await step('med-validate', 'Validation par le pharmacien', () =>
        call(Role.PHARMACIST, 'post', `/medication-requests/${medId}/validate`, {
          decision: 'approve',
          note: 'Stock disponible, posologie conforme (démo).',
        }),
      );
    }

    // 7 · M5 — order a lab study (Physician).
    const order = await step('lab-order', 'Demande de laboratoire (HbA1c)', () =>
      call<{ id?: string }>(Role.PHYSICIAN, 'post', '/service-requests', {
        patientId,
        category: ServiceCategory.LABORATORY,
        display: 'HbA1c',
        loinc: '4548-4',
        priority: 'routine',
      }),
    );

    // 8 · M5 — Lab-Technician posts the (abnormal) result (§6).
    await step('lab-result', 'Résultat de laboratoire (HbA1c 8,1 %)', () =>
      call(Role.LAB_TECHNICIAN, 'post', '/diagnostic-reports', {
        patientId,
        serviceRequestId: order.id,
        category: ServiceCategory.LABORATORY,
        loinc: '4548-4',
        display: 'HbA1c',
        value: 8.1,
        unit: '%',
        conclusion: 'HbA1c élevée (> 7 %) — révision du plan de soins recommandée (démo PoC).',
      }),
    );

    // 9 · M6 — export a DSP summary document (Physician).
    await step('document', 'Document DSP (résumé exporté)', () =>
      call(Role.PHYSICIAN, 'post', `/dsp/${patientId}/documents`, {
        title: 'Résumé de séjour — démonstration',
        description: 'Synthèse générée pour la vidéo de démonstration.',
        contentText:
          'Patiente hypertendue et diabétique de type 2, zone rurale, couverture RAMED. ' +
          'Plan de soins chronique actif. Données de démonstration (PoC).',
      }),
    );

    // 10 · M4 — breaching observation (Nurse): systolic BP 185 mmHg (Grade 3, §7
    // rule ≥180 → **high**) so the alert is escalation-grade (§8). Left **Pending**,
    // arming the 15-min escalation timer — the flagship alert to watch escalate
    // live. Submitted last so the timer is freshest when the UI lands on /alerts.
    const obs = await step('observation', 'Observation tension 185 mmHg → alerte élevée', () =>
      call<{ alert?: { id?: string } }>(Role.NURSE, 'post', '/observations', {
        patientId,
        metric: 'systolic-bp',
        value: 185,
        source: 'app',
      }),
    );
    alertId = obs.alert?.id;

    this.logger.log(
      `Demo scenario seeded for Patient/${patientId}, alert ${alertId ?? 'n/a'} (${steps.length} steps).`,
    );
    return { ok: true, patientId, patientName, alertId, steps };
  }
}

/** Flatten an axios/unknown error into a single human-readable line. */
function describe(err: unknown): string {
  if (isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as { message?: unknown } | undefined;
    const raw = Array.isArray(data?.message) ? data?.message.join('; ') : data?.message;
    const message = typeof raw === 'string' ? raw : err.message;
    return status ? `HTTP ${status} — ${message}` : message;
  }
  return err instanceof Error ? err.message : String(err);
}
