import { useQuery } from '@tanstack/react-query';
import { api } from '../axios';
import type { KpiReport } from '../types/kpis';

export const kpiKeys = {
  all: ['kpis'] as const,
};

/**
 * Balanced-scorecard KPIs (GET /kpis). Computed live from FHIR at the gateway,
 * with the seeder's docs/kpis.json as a fallback. Restricted to Admin/Physician.
 */
export function useKpis(refetchMs?: number) {
  return useQuery({
    queryKey: kpiKeys.all,
    queryFn: async (): Promise<KpiReport> => {
      const { data } = await api.get<KpiReport>('/kpis');
      return data;
    },
    refetchInterval: refetchMs,
  });
}
