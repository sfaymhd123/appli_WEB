import { useState } from 'react';
import { Calendar, Clock, MessageSquare, Phone, Plus, Search, User } from 'lucide-react';
import type { Patient } from 'fhir/r4';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Spinner,
  TextField,
  useToast,
} from '../../components/ui';
import {
  useAppointments,
  useCreateAppointment,
  type AppointmentSummary,
} from '../../lib/api/hooks/use-appointments';
import { usePatientSearch } from '../../lib/api/hooks/use-patients';
import { patientDisplayName, patientMrn, patientPhone } from '../patients/patient-display';
import { errorMessage } from '../../lib/api/error';

function formatDateTime(iso: string): { date: string; time: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: iso, time: '' };
  return {
    date: date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }),
    time: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function AppointmentBookingPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [aptDate, setAptDate] = useState('');
  const [aptTime, setAptTime] = useState('');
  const [aptDesc, setAptDesc] = useState('');

  const trimmedTerm = searchTerm.trim();
  const isIdSearch =
    trimmedTerm.toLowerCase().startsWith('pat-') ||
    trimmedTerm.toUpperCase().startsWith('HPHII-') ||
    trimmedTerm.toUpperCase().startsWith('SCALED-');

  const patientsQuery = usePatientSearch({
    name: !isIdSearch ? trimmedTerm || undefined : undefined,
    identifier: isIdSearch ? trimmedTerm || undefined : undefined,
  });
  const appointmentsQuery = useAppointments();
  const createAppointment = useCreateAppointment();

  async function onBook(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPatient?.id || !aptDate || !aptTime) return;

    try {
      const start = new Date(`${aptDate}T${aptTime}`).toISOString();
      await createAppointment.mutateAsync({
        patientId: selectedPatient.id,
        start,
        description: aptDesc.trim() || undefined,
      });
      toast('Rendez-vous programme et SMS envoye.', 'success');
      setSelectedPatient(null);
      setAptDate('');
      setAptTime('');
      setAptDesc('');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card className="flex max-h-[calc(100vh-12rem)] flex-col">
        <CardHeader
          title="1. Selectionner un patient"
          description="Recherchez le patient par son nom ou choisissez dans la liste."
        />
        <CardBody className="min-h-0 flex-1 space-y-4">
          <div className="group relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-clinical-600" />
            <input
              type="text"
              placeholder="Nom ou identifiant..."
              className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 py-2.5 pl-10 pr-10 text-sm outline-none transition-all focus:border-clinical-500 focus:bg-white"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200"
              >
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            )}
          </div>

          <div className="max-h-[calc(100vh-22rem)] min-h-[280px] space-y-2 overflow-y-auto pr-1">
            {patientsQuery.isFetching && (
              <div className="flex flex-col items-center justify-center space-y-3 py-12">
                <Spinner size="lg" className="text-clinical-600" />
                <p className="animate-pulse text-xs font-medium uppercase tracking-widest text-gray-400">
                  Recherche en cours...
                </p>
              </div>
            )}

            {!patientsQuery.isFetching && patientsQuery.data?.patients.length === 0 && (
              <div className="py-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-300">
                  <User className="h-6 w-6" />
                </div>
                <p className="text-sm italic text-gray-400">Aucun patient trouve.</p>
              </div>
            )}

            {!patientsQuery.isFetching &&
              patientsQuery.data?.patients.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  onClick={() => setSelectedPatient(patient)}
                  className={`flex w-full items-center justify-between rounded-xl border-2 p-3 transition-all ${
                    selectedPatient?.id === patient.id
                      ? 'border-clinical-500 bg-clinical-50 shadow-sm'
                      : 'border-transparent bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-3 text-left">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        selectedPatient?.id === patient.id
                          ? 'bg-clinical-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold leading-none text-gray-900">
                        {patientDisplayName(patient)}
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-gray-500">
                        {patientMrn(patient)}
                      </p>
                    </div>
                  </div>
                  {patientPhone(patient) ? (
                    <Badge tone="success">Mobile OK</Badge>
                  ) : (
                    <Badge tone="danger">Sans mobile</Badge>
                  )}
                </button>
              ))}
          </div>
        </CardBody>
      </Card>

      <Card className="flex max-h-[calc(100vh-12rem)] flex-col">
        <CardHeader
          title={selectedPatient ? '2. Programmer le rendez-vous' : '2. Rendez-vous programmes'}
          description={
            selectedPatient
              ? "L'envoi du SMS de confirmation est automatique."
              : 'Quelques rendez-vous sont deja planifies pour les prochains jours.'
          }
        />
        <CardBody className="min-h-0 flex-1">
          {selectedPatient ? (
            <AppointmentForm
              selectedPatient={selectedPatient}
              aptDate={aptDate}
              aptTime={aptTime}
              aptDesc={aptDesc}
              setAptDate={setAptDate}
              setAptTime={setAptTime}
              setAptDesc={setAptDesc}
              onBook={onBook}
              isPending={createAppointment.isPending}
            />
          ) : (
            <AppointmentListView
              appointments={appointmentsQuery.data?.appointments ?? []}
              isLoading={appointmentsQuery.isLoading}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function AppointmentForm({
  selectedPatient,
  aptDate,
  aptTime,
  aptDesc,
  setAptDate,
  setAptTime,
  setAptDesc,
  onBook,
  isPending,
}: {
  selectedPatient: Patient;
  aptDate: string;
  aptTime: string;
  aptDesc: string;
  setAptDate: (value: string) => void;
  setAptTime: (value: string) => void;
  setAptDesc: (value: string) => void;
  onBook: (event: React.FormEvent) => void;
  isPending: boolean;
}) {
  const phone = patientPhone(selectedPatient);

  return (
    <form onSubmit={onBook} className="space-y-6">
      <div className="flex items-start gap-4 rounded-2xl border border-clinical-100 bg-clinical-50 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clinical-600 text-white">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-clinical-800">Destinataire</p>
          <p className="mt-0.5 text-sm font-medium text-clinical-900">
            {patientDisplayName(selectedPatient)}
          </p>
          <p className="mt-1 text-xs italic text-clinical-600">
            {phone || 'Aucun numero de telephone configure.'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          type="date"
          label="Date du rendez-vous"
          required
          value={aptDate}
          onChange={(event) => setAptDate(event.target.value)}
        />
        <TextField
          type="time"
          label="Heure"
          required
          value={aptTime}
          onChange={(event) => setAptTime(event.target.value)}
        />
      </div>

      <TextField
        label="Motif de la visite"
        placeholder="Ex: Consultation de suivi, resultat de labo..."
        value={aptDesc}
        onChange={(event) => setAptDesc(event.target.value)}
        autoComplete="off"
      />

      <div className="border-t border-gray-100 pt-4">
        <Button type="submit" fullWidth size="lg" loading={isPending} disabled={!phone}>
          <Calendar className="mr-2 h-4 w-4" />
          Confirmer et envoyer SMS
        </Button>
        {!phone && (
          <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-widest text-red-500">
            L'envoi de SMS est impossible sans numero mobile.
          </p>
        )}
      </div>
    </form>
  );
}

function AppointmentListView({
  appointments,
  isLoading,
}: {
  appointments: AppointmentSummary[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" className="text-clinical-600" />
      </div>
    );
  }

  return (
    <div className="max-h-[calc(100vh-22rem)] min-h-[280px] space-y-3 overflow-y-auto pr-2">
      {appointments.map((appointment) => (
        <AppointmentRow key={appointment.id} appointment={appointment} />
      ))}
      {appointments.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">
          Aucun rendez-vous programme.
        </div>
      )}
    </div>
  );
}

function AppointmentRow({ appointment }: { appointment: AppointmentSummary }) {
  const when = formatDateTime(appointment.start);

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white text-clinical-700 shadow-sm">
          <Calendar className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900">{appointment.patientName}</p>
            {appointment.source === 'demo' && <Badge tone="neutral">Demo</Badge>}
          </div>
          <p className="text-xs text-gray-500">{appointment.patientMrn ?? appointment.patientId}</p>
          <p className="mt-1 text-sm text-gray-700">{appointment.description}</p>
          {appointment.phone && (
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              <Phone className="h-3 w-3" />
              {appointment.phone}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-gray-900">{when.date}</p>
        <p className="mt-1 flex items-center justify-end gap-1 text-sm text-clinical-700">
          <Clock className="h-3.5 w-3.5" />
          {when.time}
        </p>
        <Badge tone={appointment.status === 'booked' ? 'success' : 'warning'}>
          {appointment.status === 'booked' ? 'Confirme' : appointment.status}
        </Badge>
      </div>
    </div>
  );
}
