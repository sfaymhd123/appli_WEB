import {
  Role,
  allowedResourcesForRole,
  type FilteredResourceType,
} from '@hphii/fhir-domain';

export interface NavItem {
  to: string;
  label: string;
  /** Module tag for display (CLAUDE.md §2). */
  module: string;
  description: string;
  /**
   * Resource this section reads. Visibility is driven by the §6 role →
   * $everything filter: a role sees the item only if this resource is in its
   * allowed set. Items without a resource (e.g. the dashboard) are always shown.
   */
  resource?: FilteredResourceType;
  /**
   * Roles allowed to see this item, for sections not governed by the §6
   * resource filter (e.g. M2 Triage). When set, the role must be included.
   */
  roles?: readonly Role[];
}

/**
 * Full nav catalogue. Order here is the display order in the side nav.
 * Visibility per role is computed from CLAUDE.md §6 — see `visibleNavItems`.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/',
    label: 'Tableau de bord',
    module: 'Accueil',
    description: 'Vue d’ensemble du dossier de santé partagé.',
  },
  {
    to: '/patients',
    label: 'Patients',
    module: 'M1',
    description: 'Identité patient, couverture RAMED/AMO.',
    resource: 'Patient',
  },
  {
    to: '/triage',
    label: 'Triage',
    module: 'M2',
    description: 'Priorisation algorithmique (P1–P5) et file d’attente.',
    roles: [Role.NURSE, Role.PHYSICIAN],
  },
  {
    to: '/observations',
    label: 'Monitoring',
    module: 'M4',
    description: 'Constantes vitales et mesures (LOINC/UCUM).',
    resource: 'Observation',
  },
  {
    to: '/alerts',
    label: 'Alertes',
    module: 'M4',
    description: 'Anomalies détectées et escalade à 15 min.',
    resource: 'DetectedIssue',
  },
  {
    to: '/care-plans',
    label: 'Plans de soins',
    module: 'M3a',
    description: 'Parcours chronique : objectifs et équipe de soins.',
    resource: 'CarePlan',
  },
  {
    to: '/documents',
    label: 'Documents',
    module: 'M6',
    description: 'Comptes rendus et pièces du dossier.',
    resource: 'DocumentReference',
  },
  {
    to: '/lab-results',
    label: 'Résultats de laboratoire',
    module: 'M5',
    description: 'Comptes rendus biologiques.',
    resource: 'DiagnosticReport',
  },
  {
    to: '/prescriptions',
    label: 'Prescriptions',
    module: 'M5',
    description: 'Demandes de médicaments à valider.',
    resource: 'MedicationRequest',
  },
  {
    to: '/audit',
    label: 'Journal d’audit',
    module: 'M6',
    description: 'Traçabilité des accès au DSP (IHE ATNA).',
    resource: 'AuditEvent',
  },
];

/** Nav items a role may see, per the §6 $everything filter and explicit roles. */
export function visibleNavItems(role: Role): NavItem[] {
  const allowed = allowedResourcesForRole(role);
  return NAV_ITEMS.filter((item) => {
    if (item.resource && !allowed.includes(item.resource)) return false;
    if (item.roles && !item.roles.includes(role)) return false;
    return true;
  });
}
