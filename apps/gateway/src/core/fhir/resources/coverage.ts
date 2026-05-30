import type { Coverage } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const CoverageHelper = defineResource<Coverage>('Coverage');
