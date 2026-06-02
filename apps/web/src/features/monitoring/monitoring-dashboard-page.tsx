import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Role } from '@hphii/fhir-domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
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
import type { AlertSummary, VitalsSeries } from '../../lib/api/types/monitoring';
import { useAuth } from '../../lib/auth/auth-context';
import { VitalsChart } from './vitals-chart';
import { SmsLogViewer } from './sms-log-viewer';
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

export function MonitoringDashboardPage({ mode }: { mode?: 'alerts' | 'vitals' }) {
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

  // Default to showing everything if no mode is specified (fallback)
  const showAlerts = !mode || mode === 'alerts';
  const showVitals = !mode || mode === 'vitals';

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
    setPatientInput(id);
    setVitalsPatient(id);
    // If we are in alerts mode, we might want to switch to vitals, 
    // but for now we just show them in the same page if both are active.
  }

  const activeAlerts = alerts.data?.alerts ?? [];
  const groups = useMemo(() => groupByUnit(vitals.data?.series ?? []), [vitals.data]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
            {mode === 'alerts' ? 'Gestion des Alertes' : mode === 'vitals' ? 'Suivi des Constantes' : 'Monitoring & Alertes'}
          </h1>
          <p className="mt-1 text-sm text-gray-500 font-medium">
            {mode === 'alerts' 
              ? 'Surveillance des anomalies critiques et gestion des escalades (15 min).'
              : 'Analyse des tendances physiologiques et historique des mesures (LOINC/UCUM).'}
          </p>
        </div>
      </div>

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

      {showVitals && (
        <Card hover>
          <CardHeader
            tone="clinical"
            title="Tendance des constantes"
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

            {vitalsPatient === '' ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400 font-medium italic">
                  Saisissez un identifiant patient ci-dessus pour générer les graphiques.
                </p>
              </div>
            ) : vitals.isLoading ? (
              <div className="flex justify-center py-12">
                <Spinner size="lg" className="text-clinical-600" />
              </div>
            ) : vitals.isError ? (
              <EmptyState title="Constantes indisponibles" description={errorMessage(vitals.error)} />
            ) : groups.length === 0 ? (
              <EmptyState
                title="Aucune mesure"
                description={`Aucune observation enregistrée pour le patient ${vitalsPatient}.`}
              />
            ) : (
              <div className="space-y-10">
                {groups.map((group) => (
                  <div key={group.unit} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-clinical-500" />
                      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{group.unit}</h3>
                    </div>
                    <div className="rounded-2xl border border-gray-100 bg-gray-50/30 p-4">
                      <VitalsChart unit={group.unit} series={group.series} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}
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
}

function AlertCard({ alert, now, busy, onAcknowledge, onResolve, onShowVitals }: AlertCardProps) {
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
