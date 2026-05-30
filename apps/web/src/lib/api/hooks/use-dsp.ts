import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bundle, DocumentReference } from 'fhir/r4';
import { api } from '../axios';
import type { CreateDocumentRequest, DspAuditTrail } from '../types/dsp';

export const dspKeys = {
  all: ['dsp'] as const,
  record: (patientId: string) => ['dsp', 'record', patientId] as const,
  audit: (patientId: string) => ['dsp', 'audit', patientId] as const,
};

/** Role-filtered Shared Health Record for a patient (M6, §6). */
export function useDspRecord(patientId: string | undefined) {
  return useQuery({
    queryKey: dspKeys.record(patientId ?? ''),
    enabled: Boolean(patientId),
    queryFn: async (): Promise<Bundle> => {
      const { data } = await api.get<Bundle>(`/dsp/${patientId}`);
      return data;
    },
  });
}

/**
 * Patient AuditEvent trail (admin/physician). `enabled` gates the request by
 * role so disallowed roles never trigger a 403.
 */
export function useDspAudit(patientId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: dspKeys.audit(patientId ?? ''),
    enabled: Boolean(patientId) && enabled,
    queryFn: async (): Promise<DspAuditTrail> => {
      const { data } = await api.get<DspAuditTrail>(`/dsp/${patientId}/audit`);
      return data;
    },
  });
}

/** Export a summary DocumentReference (physician/admin per §6 export right). */
export function useExportDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      patientId: string;
      body: CreateDocumentRequest;
    }): Promise<DocumentReference> => {
      const { data } = await api.post<DocumentReference>(
        `/dsp/${vars.patientId}/documents`,
        vars.body,
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: dspKeys.record(vars.patientId) });
      void queryClient.invalidateQueries({ queryKey: dspKeys.audit(vars.patientId) });
    },
  });
}
