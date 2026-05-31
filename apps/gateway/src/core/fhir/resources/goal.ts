import type { Goal } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const GoalHelper = defineResource<Goal>('Goal');
