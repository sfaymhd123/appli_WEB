import type { MedicationRequest } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const MedicationRequestHelper = defineResource<MedicationRequest>('MedicationRequest');
