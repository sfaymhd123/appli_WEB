import type { DiagnosticReport } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const DiagnosticReportHelper = defineResource<DiagnosticReport>('DiagnosticReport');
