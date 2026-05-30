import type { Bundle, FhirResource } from 'fhir/r4';
import { DspAction, HphiiUrls, Role, RoleLabels, canPerform } from '@hphii/fhir-domain';
import type { BadgeTone } from '../../components/ui';

/** French section title per resource type. */
const RESOURCE_TYPE_LABELS: Record<string, string> = {
  Patient: 'Identité patient',
  CarePlan: 'Plans de soins',
  Observation: 'Observations / constantes',
  DetectedIssue: 'Anomalies détectées',
  DiagnosticReport: 'Comptes rendus de laboratoire',
  MedicationRequest: 'Prescriptions',
  DocumentReference: 'Documents',
  AuditEvent: 'Événements d’audit',
};

/** Display order for the grouped sections. */
const SECTION_ORDER: readonly string[] = [
  'Patient',
  'CarePlan',
  'Observation',
  'DetectedIssue',
  'DiagnosticReport',
  'MedicationRequest',
  'DocumentReference',
  'AuditEvent',
];

export function resourceTypeLabel(type: string): string {
  return RESOURCE_TYPE_LABELS[type] ?? type;
}

export interface DspSection {
  type: string;
  label: string;
  resources: FhirResource[];
}

/** Group a $everything Bundle's entries by resource type, in display order. */
export function groupBundleByType(bundle: Bundle | undefined): DspSection[] {
  const groups = new Map<string, FhirResource[]>();
  for (const entry of bundle?.entry ?? []) {
    const resource = entry.resource;
    if (!resource) continue;
    const list = groups.get(resource.resourceType) ?? [];
    list.push(resource);
    groups.set(resource.resourceType, list);
  }
  return [...groups.entries()]
    .map(([type, resources]) => ({ type, label: resourceTypeLabel(type), resources }))
    .sort((a, b) => orderIndex(a.type) - orderIndex(b.type));
}

function orderIndex(type: string): number {
  const i = SECTION_ORDER.indexOf(type);
  return i === -1 ? SECTION_ORDER.length : i;
}

/**
 * Best-effort timestamp for a resource. We read the type-specific date field
 * and fall back to meta.lastUpdated. Typed via a loose date-bearing shape
 * (not `any`) because the FHIR union has no shared date property.
 */
interface DatedResource {
  meta?: { lastUpdated?: string };
  effectiveDateTime?: string;
  issued?: string;
  identifiedDateTime?: string;
  date?: string;
  created?: string;
  authoredOn?: string;
  recorded?: string;
  period?: { start?: string };
}

export function resourceTimestamp(resource: FhirResource): string | undefined {
  const r = resource as DatedResource;
  return (
    r.effectiveDateTime ??
    r.identifiedDateTime ??
    r.authoredOn ??
    r.date ??
    r.created ??
    r.recorded ??
    r.issued ??
    r.period?.start ??
    r.meta?.lastUpdated
  );
}

/** Short, human-readable one-liner describing a resource (no PHI beyond what the role may see). */
export function resourceSummary(resource: FhirResource): string {
  switch (resource.resourceType) {
    case 'Observation': {
      const code =
        resource.code?.text ??
        resource.code?.coding?.[0]?.display ??
        resource.code?.coding?.[0]?.code ??
        'Observation';
      const q = resource.valueQuantity;
      const value = q?.value !== undefined ? `${q.value}${q.unit ? ` ${q.unit}` : ''}` : undefined;
      return value ? `${code} : ${value}` : code;
    }
    case 'DetectedIssue': {
      const severity = resource.severity ? severityLabel(resource.severity) : undefined;
      const detail = resource.detail ?? resource.code?.text;
      return [severity, detail].filter(Boolean).join(' — ') || 'Anomalie détectée';
    }
    case 'DocumentReference':
      return (
        resource.content?.[0]?.attachment?.title ??
        resource.description ??
        resource.type?.text ??
        'Document'
      );
    case 'CarePlan':
      return resource.title ?? resource.description ?? `Plan de soins (${resource.status})`;
    case 'DiagnosticReport':
      return resource.code?.text ?? resource.code?.coding?.[0]?.display ?? 'Compte rendu';
    case 'MedicationRequest':
      return (
        resource.medicationCodeableConcept?.text ??
        resource.medicationCodeableConcept?.coding?.[0]?.display ??
        `Prescription (${resource.status})`
      );
    case 'Patient': {
      const name = resource.name?.[0];
      const full = name
        ? [name.given?.join(' '), name.family].filter(Boolean).join(' ')
        : undefined;
      return full || `Patient ${resource.id ?? ''}`.trim();
    }
    case 'AuditEvent':
      return `Accès ${resource.action ?? ''}`.trim();
    default:
      return resource.resourceType;
  }
}

const SEVERITY_LABELS: Record<string, string> = {
  high: 'Haute',
  moderate: 'Modérée',
  low: 'Basse',
};
function severityLabel(severity: string): string {
  return SEVERITY_LABELS[severity] ?? severity;
}

/** The RBAC-filter tag the gateway stamps on the role-filtered Bundle. */
export interface RbacFilterTag {
  code?: string;
  display?: string;
}
export function rbacFilterTag(bundle: Bundle | undefined): RbacFilterTag | undefined {
  const tag = bundle?.meta?.tag?.find((t) => t.system === HphiiUrls.RBAC_FILTER);
  return tag ? { code: tag.code, display: tag.display } : undefined;
}

/** Format an ISO instant for compact display (fr-FR), or em dash. */
export function shortDateTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/* ---- Audit-trail display helpers ---- */

const AUDIT_ACTION_LABELS: Record<string, string> = {
  C: 'Création',
  R: 'Lecture',
  U: 'Modification',
  D: 'Suppression',
  E: 'Export / exécution',
};
export function auditActionLabel(action?: string): string {
  return action ? (AUDIT_ACTION_LABELS[action] ?? action) : '—';
}

/** AuditEvent.outcome 0 = success. */
export function auditOutcomeTone(outcome?: string): BadgeTone {
  return outcome === undefined || outcome === '0' ? 'success' : 'danger';
}
export function auditOutcomeLabel(outcome?: string): string {
  return outcome === undefined || outcome === '0' ? 'Succès' : `Échec (${outcome})`;
}

/* ---- Role helpers ---- */

export function roleLabel(role?: string): string {
  if (!role) return '—';
  return (RoleLabels as Record<string, string>)[role] ?? role;
}

/** Whether the role may export the record (§6 matrix). */
export function canExportRecord(role: Role): boolean {
  return canPerform(role, DspAction.EXPORT_RECORD);
}

/** Whether the role may view the audit trail (admin/physician). */
export function canViewAudit(role: Role): boolean {
  return role === Role.ADMIN || role === Role.PHYSICIAN;
}
