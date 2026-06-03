import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Calendar, User } from 'lucide-react';
import { Role } from '@hphii/fhir-domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Modal,
  Spinner,
  TextField,
  useToast,
} from '../../components/ui';
import { cn } from '../../lib/utils/cn';
import { errorMessage } from '../../lib/api/error';
import { useAlertStream } from '../../lib/api/hooks/use-alert-stream';
import {
  monitoringKeys,
  useAcknowledgeAlert,
  useActiveAlerts,
  useResolveAlert,
  useVitalsTrend,
} from '../../lib/api/hooks/use-monitoring';
import { useCreateAppointment } from '../../lib/api/hooks/use-appointments';
import { usePatient } from '../../lib/api/hooks/use-patients';
import type { AlertSummary, VitalsSeries } from '../../lib/api/types/monitoring';
import { useAuth } from '../../lib/auth/auth-context';
import { VitalsChart } from './vitals-chart';
import { SmsLogViewer } from './sms-log-viewer';
import { AppointmentBookingPage } from '../appointments/appointment-booking-page';
import {
  ACK_LABEL,
  ACK_TONE,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  STATUS_LABEL,
  escalationDeadline,
  formatCountdown,
  referenceId,
  shortDateTime,
} from './monitoring-display';

/** A 1 Hz clock so escalation countdowns tick live. */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function groupByUnit(series: VitalsSeries[]): { unit: string; series: VitalsSeries[] }[] {
  const map = new Map<string, VitalsSeries[]>();
  for (const s of series) {
    const list = map.get(s.unit) ?? [];
    list.push(s);
    map.set(s.unit, list);
  }
  return [...map.entries()].map(([unit, list]) => ({ unit, series: list }));
}

export function MonitoringDashboardPage({ mode }: { mode?: 'alerts' | 'vitals' | 'appointments' }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const alerts = useActiveAlerts();
  const acknowledge = useAcknowledgeAlert();
  const resolve = useResolveAlert();
  const now = useNow(1000);

  const [patientInput, setPatientInput] = useState('');
  const [vitalsPatient, setVitalsPatient] = useState('');
  const vitals = useVitalsTrend(vitalsPatient, vitalsPatient !== '');

  // Appointment states
  const [aptPatientId, setAptPatientId] = useState<string | null>(null);
  const aptPatientQuery = usePatient(aptPatientId || undefined);
  const [aptModalOpen, setAptModalOpen] = useState(false);

  // Vitals visibility states
  const showAlerts = !mode || mode === 'alerts';
  const showSearch = mode === 'vitals';
  const showAppointments = mode === 'appointments';
  const [modalOpen, setModalOpen] = useState(false);

  // Instant toasts via SSE; the polled query above remains the source of truth.
  useAlertStream(
    useCallback(
      (event) => {
        if (event.kind === 'alert.escalated') toast(event.message, 'error');
        else if (event.kind === 'alert.created') toast(event.message, 'warning');
        else if (event.kind === 'careplan.review-needed') toast(event.message, 'info');
        void queryClient.invalidateQueries({ queryKey: monitoringKeys.alerts() });
      },
      [toast, queryClient],
    ),
  );

  async function onAcknowledge(id: string) {
    try {
      await acknowledge.mutateAsync({ alertId: id });
      toast('Alerte acquittée — escalade annulée.', 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  async function onResolve(id: string) {
    try {
      await resolve.mutateAsync({ alertId: id });
      toast('Alerte résolue.', 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  function onLoadVitals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVitalsPatient(patientInput.trim());
  }

  function showPatientVitals(reference?: string) {
    const id = referenceId(reference);
    if (!id) return;
    setVitalsPatient(id);
    setModalOpen(true);
  }

  function showAppointmentBooking(reference?: string) {
    const id = referenceId(reference);
    if (!id) return;
    setAptPatientId(id);
    setAptModalOpen(true);
  }

  const activeAlerts = alerts.data?.alerts ?? [];
  const groups = useMemo(() => groupByUnit(vitals.data?.series ?? []), [vitals.data]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
            {mode === 'alerts' ? 'Gestion des Alertes' : mode === 'vitals' ? 'Suivi des Constantes' : mode === 'appointments' ? 'Gestion des Rendez-vous' : 'Monitoring & Alertes'}
          </h1>
          <p className="mt-1 text-sm text-gray-500 font-medium">
            {mode === 'alerts' 
              ? 'Surveillance des anomalies critiques et gestion des escalades (15 min).'
              : mode === 'vitals'
              ? 'Analyse des tendances physiologiques et historique des mesures (LOINC/UCUM).'
              : 'Planification et notifications patients (SMS).'}
          </p>
        </div>
      </div>

      {showAppointments && <AppointmentBookingPage />}

      {showAlerts && (
        <div className={cn(
          "grid grid-cols-1 gap-6",
          user?.role === Role.ADMIN ? "lg:grid-cols-3" : "lg:grid-cols-1"
        )}>
          <div className={user?.role === Role.ADMIN ? "lg:col-span-2" : ""}>
            <Card hover>
              <CardHeader
                tone="danger"
                title="Alertes actives"
                description="Anomalies détectées non résolues, les plus récentes en tête."
                action={
                  <Badge tone={activeAlerts.length ? 'danger' : 'success'} className="animate-pulse">
                    {activeAlerts.length} active(s)
                  </Badge>
                }
              />
              <CardBody>
                {alerts.isLoading ? (
                  <div className="flex justify-center py-12">
                    <Spinner size="lg" className="text-clinical-600" />
                  </div>
                ) : alerts.isError ? (
                  <EmptyState title="Alertes indisponibles" description={errorMessage(alerts.error)} />
                ) : activeAlerts.length === 0 ? (
                  <EmptyState
                    title="Aucune alerte active"
                    description="Le système est stable. Les anomalies de constantes apparaîtront ici."
                  />
                ) : (
                  <ul className="space-y-4">
                    {activeAlerts.map((alert) => (
                      <AlertCard
                        key={alert.id}
                        alert={alert}
                        now={now}
                        busy={acknowledge.isPending || resolve.isPending}
                        onAcknowledge={() => onAcknowledge(alert.id)}
                        onResolve={() => onResolve(alert.id)}
                        onShowVitals={() => showPatientVitals(alert.patientReference)}
                        onShowAppointment={() => showAppointmentBooking(alert.patientReference)}
                      />
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          {user?.role === Role.ADMIN && (
            <div className="space-y-6">
              <SmsLogViewer />
            </div>
          )}
        </div>
      )}

      {/* Main Monitoring Search (vitals mode only) */}
      {showSearch && (
        <Card hover>
          <CardHeader
            tone="clinical"
            title="Recherche de constantes"
            description="Visualisation des séries temporelles avec lignes de seuil nationales."
          />
          <CardBody className="space-y-6">
            <form className="flex flex-wrap items-end gap-3" onSubmit={onLoadVitals}>
              <div className="min-w-[20rem] flex-1">
                <TextField
                  name="vitalsPatient"
                  label="Identifiant du patient"
                  placeholder="ex: pat-1986"
                  value={patientInput}
                  onChange={(e) => setPatientInput(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <Button type="submit" variant="secondary" loading={vitals.isFetching} className="rounded-xl h-12">
                Afficher les courbes
              </Button>
            </form>

            {vitalsPatient !== '' && (
              <div className="space-y-10">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-clinical-500" />
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Données pour {vitalsPatient}</h3>
                </div>
                <VitalsList groups={groups} isLoading={vitals.isLoading} />
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Vitals Viewer Modal (Used by alerts page) */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        className="max-w-[65vw]"
        title={
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-clinical-50 text-clinical-600">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">Analyse des Constantes</p>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Patient : {vitalsPatient}</p>
            </div>
          </div>
        }
        footer={<Button onClick={() => setModalOpen(false)}>Fermer l'analyse</Button>}
      >
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <VitalsList groups={groups} isLoading={vitals.isLoading} />
        </div>
      </Modal>

      {/* Appointment Booking Modal (Integrated M7) */}
      <Modal
        open={aptModalOpen}
        onClose={() => setAptModalOpen(false)}
        className="max-w-2xl"
        title={
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-clinical-50 text-clinical-600">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">Programmer un Rendez-vous</p>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Suite à alerte</p>
            </div>
          </div>
        }
      >
        <div className="py-2">
          {aptPatientQuery.isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !aptPatientQuery.data ? (
            <EmptyState title="Erreur" description="Impossible de charger les données du patient." />
          ) : (
            <AppointmentForm 
              patient={aptPatientQuery.data} 
              onSuccess={() => setAptModalOpen(false)} 
            />
          )}
        </div>
      </Modal>
    </div>
  );
}

function AppointmentForm({ patient, onSuccess }: { patient: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const createAppointment = useCreateAppointment();
  const [aptDate, setAptDate] = useState('');
  const [aptTime, setAptTime] = useState('');
  const [aptDesc, setAptDesc] = useState('Suivi suite alerte monitoring');

  const phone = patient.telecom?.find((t: any) => t.system === 'phone')?.value;

  async function onBook(e: React.FormEvent) {
    e.preventDefault();
    try {
      const start = new Date(`${aptDate}T${aptTime}`).toISOString();
      await createAppointment.mutateAsync({
        patientId: patient.id!,
        start,
        description: aptDesc.trim() || undefined,
      });
      toast('Rendez-vous programmé et SMS envoyé.', 'success');
      onSuccess();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  return (
    <form onSubmit={onBook} className="space-y-6">
      <div className="p-4 rounded-2xl bg-clinical-50 border border-clinical-100 flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-clinical-600 flex items-center justify-center text-white shrink-0">
          <User className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold text-clinical-800 uppercase tracking-wider">Patient</p>
          <p className="text-sm font-medium text-clinical-900 mt-0.5">
            {patient.name?.[0]?.family?.toUpperCase()} {patient.name?.[0]?.given?.join(' ')}
          </p>
          <p className="text-xs text-clinical-600 mt-1 italic">
            {phone ? `SMS : ${phone}` : 'Aucun mobile configuré (SMS impossible).'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          type="date"
          label="Date"
          required
          value={aptDate}
          onChange={(e) => setAptDate(e.target.value)}
        />
        <TextField
          type="time"
          label="Heure"
          required
          value={aptTime}
          onChange={(e) => setAptTime(e.target.value)}
        />
      </div>

      <TextField
        label="Motif"
        value={aptDesc}
        onChange={(e) => setAptDesc(e.target.value)}
      />

      <div className="pt-4 flex gap-3">
        <Button 
          type="submit" 
          fullWidth 
          size="lg" 
          loading={createAppointment.isPending}
          disabled={!phone}
        >
          <Calendar className="mr-2 h-4 w-4" />
          Confirmer et notifier par SMS
        </Button>
      </div>
    </form>
  );
}

function VitalsList({ groups, isLoading }: { groups: { unit: string; series: VitalsSeries[] }[], isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" className="text-clinical-600" />
      </div>
    );
  }
  if (groups.length === 0) {
    return <p className="text-center py-8 text-gray-400 italic">Aucune donnée disponible.</p>;
  }
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.unit} className="space-y-3">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{group.unit}</h4>
          <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4">
            <VitalsChart unit={group.unit} series={group.series} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface AlertCardProps {
  alert: AlertSummary;
  now: number;
  busy: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
  onShowVitals: () => void;
  onShowAppointment: () => void;
}

function AlertCard({ alert, now, busy, onAcknowledge, onResolve, onShowVitals, onShowAppointment }: AlertCardProps) {
  const severity = alert.severity ?? 'moderate';
  const canAcknowledge = alert.status !== 'final' && alert.acknowledgement !== 'Acknowledged';

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[severity] ?? 'neutral'}>
              {SEVERITY_LABEL[severity] ?? severity}
            </Badge>
            <Badge tone={ACK_TONE[alert.acknowledgement] ?? 'neutral'}>
              {ACK_LABEL[alert.acknowledgement] ?? alert.acknowledgement}
            </Badge>
            <Badge tone="neutral">{STATUS_LABEL[alert.status] ?? alert.status}</Badge>
          </div>
          <p className="text-sm text-gray-800">{alert.detail ?? 'Seuil dépassé.'}</p>
          <p className="text-xs text-gray-500">
            Patient <span className="font-mono">{referenceId(alert.patientReference) ?? '—'}</span>
            {' · '}
            {shortDateTime(alert.identifiedDateTime)}
            {alert.source ? ` · ${alert.source}` : ''}
          </p>
        </div>

        <Countdown alert={alert} now={now} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onAcknowledge} disabled={busy || !canAcknowledge}>
          Acquitter
        </Button>
        <Button size="sm" variant="secondary" onClick={onResolve} disabled={busy}>
          Résoudre
        </Button>
        <Button size="sm" variant="ghost" onClick={onShowVitals}>
          Constantes
        </Button>
        <Button size="sm" variant="ghost" onClick={onShowAppointment} className="text-clinical-700 hover:bg-clinical-50">
          Rendez-vous
        </Button>
      </div>
    </li>
  );
}

function Countdown({ alert, now }: { alert: AlertSummary; now: number }) {
  if (alert.acknowledgement === 'Escalated') {
    return <Badge tone="danger">Escaladée au senior</Badge>;
  }
  if (alert.acknowledgement === 'Acknowledged') {
    return <span className="text-xs font-medium text-gray-400">Escalade annulée</span>;
  }
  const deadline = escalationDeadline(alert.identifiedDateTime, alert.escalationMinutes);
  if (deadline === null) return null;

  const remaining = deadline - now;
  const overdue = remaining <= 0;
  return (
    <div className="text-right">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">Escalade dans</p>
      <p
        className={`font-mono text-lg font-bold tabular-nums ${
          overdue ? 'text-red-600' : remaining < 60_000 ? 'text-amber-600' : 'text-gray-800'
        }`}
      >
        {overdue ? 'imminente' : formatCountdown(remaining)}
      </p>
    </div>
  );
}
