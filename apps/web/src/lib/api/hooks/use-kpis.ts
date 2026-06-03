import { useQuery } from '@tanstack/react-query';
import { api } from '../axios';
import { useAuth } from '../../auth/auth-context';
import type { KpiReport } from '../types/kpis';

export const kpiKeys = {
  all: (role?: string, sub?: string) => ['kpis', role, sub] as const,
};

/**
 * Balanced-scorecard KPIs (GET /kpis). Computed live from FHIR at the gateway,
 * with the seeder's docs/kpis.json as a fallback. Restricted to Admin/Physician.
 */
export function useKpis(refetchMs?: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: kpiKeys.all(user?.role, user?.sub),
    queryFn: async (): Promise<KpiReport> => {
      const { data } = await api.get<KpiReport>('/kpis');
      return data;
    },
    refetchInterval: refetchMs,
    enabled: !!user,
  });
}
