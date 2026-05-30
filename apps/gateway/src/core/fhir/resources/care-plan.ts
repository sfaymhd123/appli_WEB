import type { CarePlan } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const CarePlanHelper = defineResource<CarePlan>('CarePlan');
