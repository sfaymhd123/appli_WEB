import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Patient } from 'fhir/r4';
import { api } from '../axios';
import type {
  CoverageResult,
  CreateCoverageRequest,
  CreatePatientRequest,
  PatientSearchFilters,
  PatientSearchResult,
} from '../types/patient';

export const patientKeys = {
  all: ['patients'] as const,
  list: (filters: PatientSearchFilters) => ['patients', 'list', filters] as const,
  detail: (id: string) => ['patients', 'detail', id] as const,
};

/** True when at least one search filter is set. */
export function hasPatientFilter(filters: PatientSearchFilters): boolean {
  return Boolean(filters.identifier || filters.name || filters.zone || filters.riskGroup);
}

/** Search patients (M1). Disabled until at least one filter is provided. */
export function usePatientSearch(filters: PatientSearchFilters) {
  return useQuery({
    queryKey: patientKeys.list(filters),
    enabled: hasPatientFilter(filters),
    queryFn: async (): Promise<PatientSearchResult> => {
      const { data } = await api.get<PatientSearchResult>('/patients', { params: filters });
      return data;
    },
  });
}

/** Read one patient by HAPI logical id. */
export function usePatient(id: string | undefined) {
  return useQuery({
    queryKey: patientKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Patient> => {
      const { data } = await api.get<Patient>(`/patients/${id}`);
      return data;
    },
  });
}

/** Register a new patient. */
export function useRegisterPatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreatePatientRequest): Promise<Patient> => {
      const { data } = await api.post<Patient>('/patients', body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: patientKeys.all });
    },
  });
}

/** Attach a coverage to a patient and receive the eligibility result. */
export function useAddCoverage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      patientId: string;
      body: CreateCoverageRequest;
    }): Promise<CoverageResult> => {
      const { data } = await api.post<CoverageResult>(
        `/patients/${vars.patientId}/coverage`,
        vars.body,
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: patientKeys.detail(vars.patientId) });
    },
  });
}
