import type { Condition } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const ConditionHelper = defineResource<Condition>('Condition');
