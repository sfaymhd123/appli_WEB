import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CarePlan, Encounter } from 'fhir/r4';
import { api } from '../axios';
import type {
  CarePlanResult,
  ClosePathwayRequest,
  CreateCarePlanRequest,
  CreateEpisodeRequest,
  EpisodeResult,
  PathwayResult,
  SwitchToChronicRequest,
  UpdateCarePlanRequest,
} from '../types/pathway';

export const pathwayKeys = {
  all: ['pathway'] as const,
  pathway: (patientId: string) => ['pathway', patientId] as const,
};

/** Chronic/episodic pathway snapshot for a patient (M3). */
export function usePathway(patientId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: pathwayKeys.pathway(patientId ?? ''),
    queryFn: async (): Promise<PathwayResult> => {
      const { data } = await api.get<PathwayResult>(`/patients/${patientId}/pathway`);
      return data;
    },
    enabled: Boolean(patientId) && enabled,
  });
}

/** Open a chronic CarePlan (M3a). */
export function useCreateCarePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateCarePlanRequest): Promise<CarePlanResult> => {
      const { data } = await api.post<CarePlanResult>('/careplans', body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pathwayKeys.all });
    },
  });
}

/** Adjust a chronic CarePlan (M3a). */
export function useUpdateCarePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      carePlanId: string;
      body: UpdateCarePlanRequest;
    }): Promise<CarePlan> => {
      const { data } = await api.put<CarePlan>(`/careplans/${vars.carePlanId}`, vars.body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pathwayKeys.all });
    },
  });
}

/** Close or cancel a chronic CarePlan (physician). */
export function useCloseCarePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      carePlanId: string;
      body: ClosePathwayRequest;
    }): Promise<CarePlan> => {
      const { data } = await api.post<CarePlan>(`/careplans/${vars.carePlanId}/close`, vars.body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pathwayKeys.all });
    },
  });
}

/** Acknowledge (clear) a pending CarePlan review raised by M4 (HbA1c > 7). */
export function useAcknowledgeReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (carePlanId: string): Promise<CarePlan> => {
      const { data } = await api.post<CarePlan>(`/careplans/${carePlanId}/review/acknowledge`);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pathwayKeys.all });
    },
  });
}

/** Open an acute episode (M3b). */
export function useCreateEpisode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateEpisodeRequest): Promise<EpisodeResult> => {
      const { data } = await api.post<EpisodeResult>('/episodes', body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pathwayKeys.all });
    },
  });
}

/** Close or cancel an acute episode. */
export function useCloseEpisode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      episodeId: string;
      body: ClosePathwayRequest;
    }): Promise<Encounter> => {
      const { data } = await api.post<Encounter>(`/episodes/${vars.episodeId}/close`, vars.body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pathwayKeys.all });
    },
  });
}

/** Convert an episode to a chronic plan (physician). */
export function useSwitchToChronic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      episodeId: string;
      body: SwitchToChronicRequest;
    }): Promise<CarePlan> => {
      const { data } = await api.post<CarePlan>(
        `/episodes/${vars.episodeId}/switch-to-chronic`,
        vars.body,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pathwayKeys.all });
    },
  });
}
