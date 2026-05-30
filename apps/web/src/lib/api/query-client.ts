import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client. `networkMode: 'offlineFirst'` lets cached data
 * serve while offline and defers refetches until connectivity returns
 * (CLAUDE.md §8 offline-first). Retries are modest to avoid hammering a flaky
 * rural link.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: 0,
    },
  },
});
