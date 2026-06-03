import { Injectable, Logger } from '@nestjs/common';
import type { Patient } from 'fhir/r4';
import { AppointmentHelper, FhirService } from '../../core/fhir';
import { NotificationService } from '../../core/notifications';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    private readonly fhir: FhirService,
    private readonly notifications: NotificationService,
  ) {}

  async create(dto: CreateAppointmentDto) {
    const patient = await this.fhir.read<Patient>('Patient', dto.patientId);
    
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

    const phone = patient.telecom?.find((t) => t.system === 'phone')?.value;
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
}
