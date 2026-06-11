import { Injectable, Logger } from '@nestjs/common';
import type { Appointment, Patient } from 'fhir/r4';
import { HphiiUrls, Role } from '@hphii/fhir-domain';
import { AppointmentHelper, FhirService } from '../../core/fhir';
import { NotificationService } from '../../core/notifications';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { patientPhone, withDemoMobile } from '../m1-accueil/patient-demo-mobile';
import type { AppointmentList, AppointmentSummary } from './appointment.types';

const MIN_VISIBLE_APPOINTMENTS = 6;
const MAX_VISIBLE_APPOINTMENTS = 8;

const NURSE_CARE_REASONS = [
  'Soin infirmier',
  'Controle tensionnel',
  'Suivi diabete',
  'Prelevement sanguin',
  'Changement de pansement',
  'Administration traitement',
];

const PHYSICIAN_REASONS = [
  'Consultation de suivi',
  'Renouvellement ordonnance',
  'Avis specialiste',
  'Examen clinique',
  'Resultats de laboratoire',
  'Evaluation parcours chronique',
];

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    private readonly fhir: FhirService,
    private readonly notifications: NotificationService,
  ) {}

  async list(role?: Role): Promise<AppointmentList> {
    const bundle = await this.fhir.search<Appointment>('Appointment', { _count: 50 });
    const isNurse = role === Role.NURSE;

    let appointments = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is Appointment => resource?.resourceType === 'Appointment')
      .filter((appointment) => Boolean(appointment.start))
      .filter((appointment) => isUpcoming(appointment.start));

    // Filter by role if specified
    if (role) {
      appointments = appointments.filter((apt) => {
        const desc = (apt.description ?? '').toLowerCase();
        if (isNurse) {
          // Nurse sees only care-related appointments
          return NURSE_CARE_REASONS.some((r) => desc.includes(r.toLowerCase())) ||
                 desc.includes('soin') || desc.includes('infirmier');
        } else {
          // Physicians and others see medical consultations
          return PHYSICIAN_REASONS.some((r) => desc.includes(r.toLowerCase())) ||
                 !NURSE_CARE_REASONS.some((r) => desc.includes(r.toLowerCase()));
        }
      });
    }

    appointments.sort((a, b) => String(a.start).localeCompare(String(b.start)));

    const patientIds = unique(
      appointments
        .map((appointment) => appointmentPatientId(appointment))
        .filter((id): id is string => Boolean(id)),
    );
    const patientMap = await this.resolvePatients(patientIds);
    const realRows = dedupeAppointments(
      appointments.map((appointment) =>
        this.toSummary(appointment, patientMap.get(appointmentPatientId(appointment) ?? '')),
      ),
    ).map((appointment, index) => normalizeDemoLikeAppointmentStart(appointment, index));
    const rows = [...realRows];

    if (rows.length < MIN_VISIBLE_APPOINTMENTS) {
      rows.push(...(await this.demoAppointments(MIN_VISIBLE_APPOINTMENTS - rows.length, rows, role)));
    }

    rows.sort((a, b) => a.start.localeCompare(b.start));
    return { total: rows.length, appointments: rows.slice(0, MAX_VISIBLE_APPOINTMENTS) };
  }

  async create(dto: CreateAppointmentDto) {
    const patient = withDemoMobile(await this.fhir.read<Patient>('Patient', dto.patientId));
    
    const appointment = await this.fhir.create(
      AppointmentHelper.build({
        status: 'booked',
        participant: [
          {
            actor: { reference: `Patient/${dto.patientId}` },
            status: 'accepted',
          },
        ],
        start: dto.start,
        description: dto.description,
      }),
    );

    const phone = patientPhone(patient);
    if (phone) {
      const date = new Date(dto.start).toLocaleString('fr-FR', {
        dateStyle: 'long',
        timeStyle: 'short',
      });
      await this.notifications.notify({
        kind: 'appointment.booked' as any,
        to: phone,
        body: `HPHII : Votre rendez-vous est confirmé pour le ${date}. Description : ${dto.description || 'Consultation'}.`,
        patient: `Patient/${dto.patientId}`,
      });
      this.logger.log(`Appointment SMS sent to ${phone}`);
    }

    return appointment;
  }

  private async demoAppointments(
    count: number,
    existing: AppointmentSummary[],
    role?: Role
  ): Promise<AppointmentSummary[]> {
    const existingPatientIds = new Set(existing.map((appointment) => appointment.patientId));
    const bundle = await this.fhir.search<Patient>('Patient', { _count: 20 });
    const patients = (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter((resource): resource is Patient => resource?.resourceType === 'Patient')
      .map(withDemoMobile)
      .filter((patient) => patient.id && !existingPatientIds.has(patient.id))
      .slice(0, count);

    const reasons = role === Role.NURSE ? NURSE_CARE_REASONS : PHYSICIAN_REASONS;

    return patients.map((patient, index) => ({
      id: `demo-${patient.id ?? index}`,
      patientId: patient.id,
      patientName: patientDisplayName(patient),
      patientMrn: patientMrn(patient),
      phone: patientPhone(patient),
      start: demoStart(index),
      status: 'booked',
      description: reasons[index % reasons.length],
      source: 'demo',
    }));
  }

  private async resolvePatients(patientIds: string[]): Promise<Map<string, Patient>> {
    const entries = await Promise.all(
      patientIds.map(async (id): Promise<[string, Patient] | undefined> => {
        try {
          return [id, withDemoMobile(await this.fhir.read<Patient>('Patient', id))];
        } catch {
          return undefined;
        }
      }),
    );
    return new Map(entries.filter((entry): entry is [string, Patient] => entry !== undefined));
  }

  private toSummary(appointment: Appointment, patient?: Patient): AppointmentSummary {
    const patientId = appointmentPatientId(appointment);
    return {
      id: appointment.id ?? `appointment-${appointment.start ?? Date.now()}`,
      patientId,
      patientName: patient ? patientDisplayName(patient) : patientId ?? 'Patient inconnu',
      patientMrn: patient ? patientMrn(patient) : undefined,
      phone: patient ? patientPhone(patient) : undefined,
      start: appointment.start ?? new Date().toISOString(),
      status: appointment.status,
      description: appointmentDescription(appointment.description),
      source: 'fhir',
    };
  }
}

function appointmentPatientId(appointment: Appointment): string | undefined {
  const reference = appointment.participant
    ?.map((participant) => participant.actor?.reference)
    .find((ref) => ref?.startsWith('Patient/'));
  return reference?.split('/').pop();
}

function demoStart(index: number): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Math.floor(index / 3) + 1);
  const slots = [
    [9, 0],
    [10, 30],
    [14, 0],
    [15, 30],
  ] as const;
  const [hour, minute] = slots[index % slots.length];
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function isUpcoming(start: string | undefined): boolean {
  if (!start) return false;
  const value = new Date(start).getTime();
  if (Number.isNaN(value)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return value >= today.getTime();
}

function patientDisplayName(patient: Patient): string {
  const name = patient.name?.[0];
  if (!name) return patient.id ?? 'Patient inconnu';
  const given = name.given?.join(' ') ?? '';
  const composed = [given, name.family].filter(Boolean).join(' ');
  return composed || name.text || patient.id || 'Patient inconnu';
}

function patientMrn(patient: Patient): string | undefined {
  return (
    patient.identifier?.find((id) => id.system === HphiiUrls.PATIENT_ID)?.value ??
    patient.identifier?.[0]?.value
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeAppointments(appointments: AppointmentSummary[]): AppointmentSummary[] {
  const seen = new Set<string>();
  return appointments.filter((appointment) => {
    const day = appointment.start.slice(0, 10);
    const key = `${appointment.patientName}|${day}|${appointment.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function appointmentDescription(description: string | undefined): string {
  if (!description) return 'Consultation';
  if (description.includes('Urgent hospitalized patient')) {
    return 'Avis specialiste prioritaire';
  }
  if (description.includes('Specialist consultation scheduled')) {
    return 'Consultation specialiste apres revue urgente';
  }
  return description;
}

function normalizeDemoLikeAppointmentStart(
  appointment: AppointmentSummary,
  index: number,
): AppointmentSummary {
  if (!isImportedDemoAppointment(appointment)) return appointment;
  return { ...appointment, start: demoStart(index) };
}

function isImportedDemoAppointment(appointment: AppointmentSummary): boolean {
  return (
    appointment.description === 'Avis specialiste prioritaire' ||
    appointment.description === 'Consultation specialiste apres revue urgente'
  );
}
