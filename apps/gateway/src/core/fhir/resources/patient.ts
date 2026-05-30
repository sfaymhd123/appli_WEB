import type { Patient } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const PatientHelper = defineResource<Patient>('Patient');
