import type { DetectedIssue } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const DetectedIssueHelper = defineResource<DetectedIssue>('DetectedIssue');
