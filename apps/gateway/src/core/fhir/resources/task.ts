import type { Task } from 'fhir/r4';
import { defineResource } from './resource-factory';

export const TaskHelper = defineResource<Task>('Task');
