import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MedicationRequest, ServiceRequest } from 'fhir/r4';
import { api } from '../axios';
import type {
  CreateDiagnosticReportRequest,
  CreateMedicationRequestRequest,
  CreateServiceRequestRequest,
  DiagnosticReportListResult,
  DiagnosticReportResult,
  MedicationOrderResult,
  PrescriptionListResult,
  ServiceNotificationEvent,
  ServiceOrderListResult,
  ValidatePrescriptionRequest,
} from '../types/services';

export const servicesKeys = {
  all: ['services'] as const,
  prescriptions: (status?: string) => ['services', 'prescriptions', status ?? 'all'] as const,
  orders: (status?: string) => ['services', 'orders', status ?? 'all'] as const,
  reports: () => ['services', 'reports'] as const,
  notifications: () => ['services', 'notifications'] as const,
};

/* ----- queries ----- */

/** Prescriptions; pass `status='draft'` for the pharmacist validation queue. */
export function usePrescriptions(status?: string, refetchMs?: number) {
  return useQuery({
    queryKey: servicesKeys.prescriptions(status),
    queryFn: async (): Promise<PrescriptionListResult> => {
      const { data } = await api.get<PrescriptionListResult>('/medication-requests', {
        params: status ? { status } : undefined,
      });
      return data;
    },
    refetchInterval: refetchMs,
  });
}

/** Service orders (lab/imaging); pass `status='active'` for the lab worklist. */
export function useServiceRequests(status?: string, refetchMs?: number) {
  return useQuery({
    queryKey: servicesKeys.orders(status),
    queryFn: async (): Promise<ServiceOrderListResult> => {
      const { data } = await api.get<ServiceOrderListResult>('/service-requests', {
        params: status ? { status } : undefined,
      });
      return data;
    },
    refetchInterval: refetchMs,
  });
}

/** Diagnostic reports (most-recent first). */
export function useDiagnosticReports(refetchMs?: number) {
  return useQuery({
    queryKey: servicesKeys.reports(),
    queryFn: async (): Promise<DiagnosticReportListResult> => {
      const { data } = await api.get<DiagnosticReportListResult>('/diagnostic-reports');
      return data;
    },
    refetchInterval: refetchMs,
  });
}

/** Recent abnormal-result notifications for the ordering physician. */
export function useAbnormalNotifications(refetchMs = 10000) {
  return useQuery({
    queryKey: servicesKeys.notifications(),
    queryFn: async (): Promise<ServiceNotificationEvent[]> => {
      const { data } = await api.get<ServiceNotificationEvent[]>('/services/notifications');
      return data;
    },
    refetchInterval: refetchMs,
  });
}

/* ----- mutations ----- */

/** Physician orders a medication → draft MedicationRequest (+ simulated stock). */
export function useCreateMedicationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateMedicationRequestRequest): Promise<MedicationOrderResult> => {
      const { data } = await api.post<MedicationOrderResult>('/medication-requests', body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: servicesKeys.all });
    },
  });
}

/** Validate (approve) or reject a draft prescription (§6: Physician/Pharmacist). */
export function useValidatePrescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      medicationRequestId: string;
      body: ValidatePrescriptionRequest;
    }): Promise<MedicationRequest> => {
      const { data } = await api.post<MedicationRequest>(
        `/medication-requests/${vars.medicationRequestId}/validate`,
        vars.body,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: servicesKeys.all });
    },
  });
}

/** Physician orders a lab/imaging study → active ServiceRequest. */
export function useCreateServiceRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateServiceRequestRequest): Promise<ServiceRequest> => {
      const { data } = await api.post<ServiceRequest>('/service-requests', body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: servicesKeys.all });
    },
  });
}

/** Lab-Technician records a result → Observation + DiagnosticReport. */
export function useCreateDiagnosticReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateDiagnosticReportRequest): Promise<DiagnosticReportResult> => {
      const { data } = await api.post<DiagnosticReportResult>('/diagnostic-reports', body);
      return data;
    },
    onSuccess: (_result, body) => {
      if (body.serviceRequestId) {
        queryClient.setQueryData<ServiceOrderListResult | undefined>(
          servicesKeys.orders('active'),
          (current) => {
            if (!current) return current;
            const orders = current.orders.filter((order) => order.id !== body.serviceRequestId);
            return { ...current, total: orders.length, orders };
          },
        );
      }
      void queryClient.invalidateQueries({ queryKey: servicesKeys.all });
    },
  });
}
