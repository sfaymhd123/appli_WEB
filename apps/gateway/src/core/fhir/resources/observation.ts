import type { Observation } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const ObservationHelper = defineResource<Observation>('Observation');
