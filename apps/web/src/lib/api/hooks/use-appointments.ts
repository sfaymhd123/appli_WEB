import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../axios';

export interface AppointmentSummary {
  id: string;
  patientId?: string;
  patientName: string;
  patientMrn?: string;
  phone?: string;
  start: string;
  status: string;
  description: string;
  source: 'fhir' | 'demo';
}

export interface AppointmentList {
  total: number;
  appointments: AppointmentSummary[];
}

export interface CreateAppointmentBody {
  patientId: string;
  start: string;
  description?: string;
}

export const appointmentKeys = {
  all: ['appointments'] as const,
};

export function useAppointments() {
  return useQuery({
    queryKey: appointmentKeys.all,
    queryFn: async (): Promise<AppointmentList> => {
      const { data } = await api.get<AppointmentList>('/appointments');
      return data;
    },
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateAppointmentBody) => {
      const { data } = await api.post('/appointments', body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appointmentKeys.all });
    },
  });
}
