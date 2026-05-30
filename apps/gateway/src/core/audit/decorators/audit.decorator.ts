import { SetMetadata } from '@nestjs/common';

/** FHIR AuditEvent.action codes (Create / Read / Update / Delete / Execute). */
export type AuditAction = 'C' | 'R' | 'U' | 'D' | 'E';

/**
 * Marks a handler as touching a patient record. The global AuditInterceptor
 * posts one AuditEvent (and a mirror row) per successful invocation.
 */
export const AUDIT_KEY = 'audit:action';
export const Audit = (action: AuditAction) => SetMetadata(AUDIT_KEY, action);
