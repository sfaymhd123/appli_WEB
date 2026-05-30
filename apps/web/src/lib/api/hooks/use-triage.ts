import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Encounter } from 'fhir/r4';
import { api } from '../axios';
import type {
  TriageQueueResult,
  TriageRequest,
  TriageResponse,
  UpdateTriageRequest,
} from '../types/triage';

export const triageKeys = {
  all: ['triage'] as const,
  queue: () => ['triage', 'queue'] as const,
};

/** Today's triage queue (M2), most-urgent first. */
export function useTriageQueue() {
  return useQuery({
    queryKey: triageKeys.queue(),
    queryFn: async (): Promise<TriageQueueResult> => {
      const { data } = await api.get<TriageQueueResult>('/triage/queue');
      return data;
    },
  });
}

/** Submit a triage assessment → Encounter + Task (+ P1 alert). */
export function useSubmitTriage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: TriageRequest): Promise<TriageResponse> => {
      const { data } = await api.post<TriageResponse>('/triage', body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: triageKeys.all });
    },
  });
}

/** Validate/override a triage decision (physician). */
export function useUpdateTriage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      encounterId: string;
      body: UpdateTriageRequest;
    }): Promise<Encounter> => {
      const { data } = await api.put<Encounter>(`/triage/${vars.encounterId}`, vars.body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: triageKeys.all });
    },
  });
}
