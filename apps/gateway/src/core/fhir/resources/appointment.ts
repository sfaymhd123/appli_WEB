import type { Appointment } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const AppointmentHelper = defineResource<Appointment>('Appointment');
