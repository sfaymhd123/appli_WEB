import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DetectedIssue } from 'fhir/r4';
import { api } from '../axios';
import { postOrQueue, type SubmitResult } from '../../offline';
import type {
  AlertsResult,
  CreateObservationRequest,
  ObservationResult,
  VitalsTrend,
} from '../types/monitoring';

export const monitoringKeys = {
  all: ['monitoring'] as const,
  alerts: () => ['monitoring', 'alerts'] as const,
  vitals: (patientId: string) => ['monitoring', 'vitals', patientId] as const,
};

/** Active alerts (M4), polled live for the dashboard countdowns. */
export function useActiveAlerts(refetchMs = 5000) {
  return useQuery({
    queryKey: monitoringKeys.alerts(),
    queryFn: async (): Promise<AlertsResult> => {
      const { data } = await api.get<AlertsResult>('/alerts');
      return data;
    },
    refetchInterval: refetchMs,
  });
}

/** Per-metric vitals time series for a patient (trend chart). */
export function useVitalsTrend(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: monitoringKeys.vitals(patientId),
    queryFn: async (): Promise<VitalsTrend> => {
      const { data } = await api.get<VitalsTrend>(`/patients/${patientId}/vitals`);
      return data;
    },
    enabled: enabled && patientId.trim().length > 0,
  });
}

/**
 * Submit a single reading → coded Observation (+ alert if a threshold breaks).
 * Offline-first (§8): queued in IndexedDB with a stable clientRequestId when the
 * device is offline (or the network drops) and replayed on reconnect, where the
 * gateway's conditional-create makes the replay idempotent — the alert/timer for
 * a reading that already landed never fires twice. Result reports `queued: true`
 * when it was stored locally instead of applied.
 */
export function useSubmitObservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateObservationRequest): Promise<SubmitResult<ObservationResult>> =>
      postOrQueue<ObservationResult, CreateObservationRequest>({
        url: '/observations',
        body,
        label: `Observation ${body.metric} ${body.patientId}`,
      }),
    onSuccess: (result, variables) => {
      if (result.queued) return;
      void queryClient.invalidateQueries({ queryKey: monitoringKeys.alerts() });
      void queryClient.invalidateQueries({ queryKey: monitoringKeys.vitals(variables.patientId) });
    },
  });
}

/** Acknowledge an alert → preliminary; cancels the escalation timer. */
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { alertId: string; note?: string }): Promise<DetectedIssue> => {
      const { data } = await api.patch<DetectedIssue>(`/alerts/${vars.alertId}/acknowledge`, {
        note: vars.note,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: monitoringKeys.alerts() });
    },
  });
}

/** Resolve an alert → final. */
export function useResolveAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { alertId: string; note?: string }): Promise<DetectedIssue> => {
      const { data } = await api.patch<DetectedIssue>(`/alerts/${vars.alertId}/resolve`, {
        note: vars.note,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: monitoringKeys.alerts() });
    },
  });
}
