import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Encounter } from 'fhir/r4';
import { api } from '../axios';
import { postOrQueue, type SubmitResult } from '../../offline';
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

/**
 * Submit a triage assessment → Encounter + Task (+ P1 alert). Offline-first
 * (§8): when the device is offline (or the network drops mid-request) the write
 * is queued in IndexedDB with a stable clientRequestId and replayed on reconnect;
 * the result then reports `queued: true` instead of a server response.
 */
export function useSubmitTriage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TriageRequest): Promise<SubmitResult<TriageResponse>> =>
      postOrQueue<TriageResponse, TriageRequest>({
        url: '/triage',
        body,
        label: `Triage ${body.patientId}`,
      }),
    onSuccess: (result) => {
      if (!result.queued) void queryClient.invalidateQueries({ queryKey: triageKeys.all });
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
