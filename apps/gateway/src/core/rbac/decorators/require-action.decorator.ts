import { SetMetadata } from '@nestjs/common';
import type { DspAction } from '@hphii/fhir-domain';

/** Gate a route on a DSP action from the §6 matrix (deny by default). */
export const ACTION_KEY = 'rbac:action';
export const RequireAction = (action: DspAction) => SetMetadata(ACTION_KEY, action);
