import type { AuditEvent } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const AuditEventHelper = defineResource<AuditEvent>('AuditEvent');
