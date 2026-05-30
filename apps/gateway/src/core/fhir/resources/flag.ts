import type { Flag } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const FlagHelper = defineResource<Flag>('Flag');
