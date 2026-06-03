import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../axios';
import type { DemoRunResult } from '../types/demo';

/**
 * Run the one-click demo seeder (dev only). The gateway drives its own endpoints
 * as each RBAC role to build a full M1→M6 patient journey, leaving one Pending
 * alert to escalate live (ARCH.md §8). On success every query is invalidated so
 * dashboards, queues and KPIs reflect the freshly seeded data.
 */
export function useRunDemo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DemoRunResult> => {
      const { data } = await api.post<DemoRunResult>('/demo/run');
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
