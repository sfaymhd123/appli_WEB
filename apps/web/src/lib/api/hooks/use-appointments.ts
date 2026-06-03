import { useMutation } from '@tanstack/react-query';
import { api } from '../axios';

export interface CreateAppointmentBody {
  patientId: string;
  start: string;
  description?: string;
}

export function useCreateAppointment() {
  return useMutation({
    mutationFn: async (body: CreateAppointmentBody) => {
      const { data } = await api.post('/appointments', body);
      return data;
    },
  });
}
