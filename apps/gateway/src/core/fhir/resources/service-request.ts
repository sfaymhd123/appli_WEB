import type { ServiceRequest } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const ServiceRequestHelper = defineResource<ServiceRequest>('ServiceRequest');
