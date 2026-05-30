import { useQuery } from '@tanstack/react-query';
import type { CapabilityStatement } from 'fhir/r4';
import { api } from '../axios';

/**
 * Typed example of the API client layer: fetches the FHIR CapabilityStatement
 * the gateway exposes at GET /fhir/metadata (a @Public passthrough). Used by the
 * dashboard as a lightweight connectivity check through the full axios stack.
 */
export function useCapabilityStatement() {
  return useQuery({
    queryKey: ['fhir', 'metadata'],
    queryFn: async (): Promise<CapabilityStatement> => {
      const { data } = await api.get<CapabilityStatement>('/fhir/metadata');
      return data;
    },
  });
}
