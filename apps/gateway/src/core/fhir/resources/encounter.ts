import type { Encounter } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const EncounterHelper = defineResource<Encounter>('Encounter');
