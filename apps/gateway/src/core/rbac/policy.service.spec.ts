import {
  ALL_ROLES,
  DspAction,
  Role,
  type DspAction as DspActionType,
  type FilteredResourceType,
  type Role as RoleType,
} from '@hphii/fhir-domain';
import { PolicyService } from './policy.service';

/**
 * Exhaustive guard over the ARCH.md §6 authorization rules. The expectations
 * below are an independent restatement of the spec tables — if the matrix in
 * fhir-domain ever drifts from §6, these assertions fail. PolicyService is the
 * gateway's single decision point (RolesGuard delegates to it), so testing it
 * pins the whole security layer.
 */

// §6 action matrix — deny by default; `true` is allowed. Transcribed from ARCH.md.
const EXPECTED_ACTIONS: Record<DspActionType, Record<RoleType, boolean>> = {
  [DspAction.READ_RECORD]: {
    Physician: true,
    Nurse: true,
    Admin: true,
    Pharmacist: true,
    'Lab-Technician': true,
  },
  [DspAction.MODIFY_CLINICAL_RECORD]: {
    Physician: true,
    Nurse: true,
    Admin: false,
    Pharmacist: false,
    'Lab-Technician': false,
  },
  [DspAction.ADD_BIOLOGICAL_RESULT]: {
    Physician: false,
    Nurse: false,
    Admin: false,
    Pharmacist: false,
    'Lab-Technician': true,
  },
  [DspAction.VALIDATE_PRESCRIPTION]: {
    Physician: true,
    Nurse: false,
    Admin: false,
    Pharmacist: true,
    'Lab-Technician': false,
  },
  [DspAction.EXPORT_RECORD]: {
    Physician: true,
    Nurse: false,
    Admin: true,
    Pharmacist: false,
    'Lab-Technician': false,
  },
  [DspAction.ARCHIVE_RECORD]: {
    Physician: false,
    Nurse: false,
    Admin: true,
    Pharmacist: false,
    'Lab-Technician': false,
  },
};

// §6 role → $everything resource filter. Order-insensitive comparison below.
const EXPECTED_EVERYTHING: Record<RoleType, FilteredResourceType[]> = {
  Physician: ['Patient', 'CarePlan', 'Observation', 'DetectedIssue', 'DocumentReference'],
  Nurse: ['Patient', 'Observation', 'DetectedIssue'],
  'Lab-Technician': ['DiagnosticReport'],
  Pharmacist: ['MedicationRequest'],
  Admin: ['Patient', 'AuditEvent'],
};

describe('PolicyService — ARCH.md §6 RBAC matrix', () => {
  const policy = new PolicyService();
  const actions = Object.values(DspAction);

  it('covers all 5 roles and all 6 actions', () => {
    expect(ALL_ROLES).toHaveLength(5);
    expect(actions).toHaveLength(6);
  });

  describe.each(ALL_ROLES)('role %s', (role) => {
    it.each(actions)('decides %s exactly per the §6 table', (action) => {
      expect(policy.canPerform(role, action)).toBe(EXPECTED_ACTIONS[action][role]);
    });

    it('exposes the §6 $everything filter (set-equal, order-insensitive)', () => {
      const allowed = policy.allowedResources(role);
      expect([...allowed].sort()).toEqual([...EXPECTED_EVERYTHING[role]].sort());
    });
  });

  it('denies an unknown action by default (deny-by-default)', () => {
    expect(policy.canPerform(Role.PHYSICIAN, 'bogus_action' as DspActionType)).toBe(false);
  });

  it('denies an unknown role by default', () => {
    expect(policy.canPerform('Janitor' as RoleType, DspAction.READ_RECORD)).toBe(false);
    expect(policy.allowedResources('Janitor' as RoleType)).toEqual([]);
  });

  it('allows every role to read the record, and only Lab-Technician to add a biological result', () => {
    for (const role of ALL_ROLES) {
      expect(policy.canPerform(role, DspAction.READ_RECORD)).toBe(true);
    }
    const adders = ALL_ROLES.filter((r) => policy.canPerform(r, DspAction.ADD_BIOLOGICAL_RESULT));
    expect(adders).toEqual([Role.LAB_TECHNICIAN]);
  });

  it('restricts archive to Admin only', () => {
    const archivers = ALL_ROLES.filter((r) => policy.canPerform(r, DspAction.ARCHIVE_RECORD));
    expect(archivers).toEqual([Role.ADMIN]);
  });
});
