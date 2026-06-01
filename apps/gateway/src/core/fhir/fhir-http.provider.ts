import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

import type { AppConfig } from '../config/configuration';
import { FHIR_HTTP_CLIENT } from './fhir.constants';

/**
 * Builds the single axios instance every HAPI call goes through (ARCH.md §9).
 * Base URL comes from config (env only — never hard-coded).
 */
export const fhirHttpProvider: Provider = {
  provide: FHIR_HTTP_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): AxiosInstance =>
    axios.create({
      baseURL: config.get('hapiBaseUrl', { infer: true }),
      timeout: 15_000,
      headers: {
        Accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json',
      },
      // FHIR expects repeated query params (a=1&a=2), not the axios default a[]=1.
      paramsSerializer: { indexes: null },
    }),
};
