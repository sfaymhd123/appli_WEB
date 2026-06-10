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
