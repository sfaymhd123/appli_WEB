import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../axios';

export interface UserSummary {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface CreateUserRequest {
  email: string;
  password?: string;
  role: string;
}

export const userKeys = {
  all: ['users'] as const,
};

export function useUsers() {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: async (): Promise<UserSummary[]> => {
      const { data } = await api.get<UserSummary[]>('/users');
      return data;
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateUserRequest) => {
      const { data } = await api.post('/users', body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/users/${id}`);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}
