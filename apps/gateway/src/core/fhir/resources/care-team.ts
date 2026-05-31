import type { CareTeam } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const CareTeamHelper = defineResource<CareTeam>('CareTeam');
