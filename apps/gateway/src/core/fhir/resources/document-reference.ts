import type { DocumentReference } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const DocumentReferenceHelper = defineResource<DocumentReference>('DocumentReference');
