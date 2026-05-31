import { useRef, useState, type FormEvent } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  SelectField,
  TextField,
  useToast,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useSubmitObservation } from '../../lib/api/hooks/use-monitoring';
import type { ObservationResult } from '../../lib/api/types/monitoring';
import { METRIC_OPTIONS, SEVERITY_LABEL, metricLabel, metricUnit } from './monitoring-display';

interface SmsMessage {
  id: number;
  direction: 'in' | 'out';
  text: string;
  at: string;
}

/** Build the gateway's auto-reply text from the engine result (no raw value logged). */
function replyFor(result: ObservationResult, metric: string, value: number): string {
  const unit = metricUnit(metric);
  if (result.alert) {
    const label = SEVERITY_LABEL[result.severity ?? ''] ?? result.severity ?? '';
    return `⚠ ${metricLabel(metric)} ${value} ${unit} hors seuil — alerte ${label.toLowerCase()} enregistrée. Un soignant a été notifié ; acquittement sous 15 min.`;
  }
  if (result.careplanReview) {
    return `Mesure reçue (${metricLabel(metric)} ${value} ${unit}). Une revue du plan de soins est programmée. Merci.`;
  }
  return `Mesure reçue (${metricLabel(metric)} ${value} ${unit}), dans les limites. Merci.`;
}

export function SmsIntakePage() {
  const { toast } = useToast();
  const submit = useSubmitObservation();

  const [patientId, setPatientId] = useState('');
  const [metric, setMetric] = useState(METRIC_OPTIONS[0]?.value ?? '');
  const [value, setValue] = useState('');
  const [thread, setThread] = useState<SmsMessage[]>([]);
  const nextId = useRef(1);

  function pushMessage(direction: SmsMessage['direction'], text: string) {
    setThread((prev) => [
      ...prev,
      { id: nextId.current++, direction, text, at: new Date().toISOString() },
    ]);
  }

  async function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = patientId.trim();
    const numeric = Number(value.trim());
    if (!id) {
      toast('Renseignez l’identifiant du patient.', 'warning');
      return;
    }
    if (value.trim() === '' || !Number.isFinite(numeric)) {
      toast('Saisissez une valeur numérique.', 'warning');
      return;
    }

    pushMessage('out', `${metricLabel(metric)} : ${value.trim()} ${metricUnit(metric)}`);
    try {
      const outcome = await submit.mutateAsync({
        patientId: id,
        metric,
        value: numeric,
        source: 'sms',
      });
      if (outcome.queued) {
        pushMessage(
          'in',
          `Mesure enregistrée hors ligne (${metricLabel(metric)} ${numeric} ${metricUnit(metric)}). Elle sera transmise dès le retour du réseau.`,
        );
        setValue('');
        toast('Mesure enregistrée hors ligne — synchronisation à la reconnexion.', 'info');
        return;
      }
      const result = outcome.data;
      pushMessage('in', replyFor(result, metric, numeric));
      setValue('');
      if (result.alert) {
        toast(`Alerte ${SEVERITY_LABEL[result.severity ?? ''] ?? ''} déclenchée.`, 'error');
      }
    } catch (error) {
      pushMessage('in', 'Échec de l’enregistrement. Réessayez ou contactez le centre.');
      toast(errorMessage(error), 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Interface SMS patient</h1>
        <p className="mt-1 text-sm text-gray-600">
          Module M4 — simulation d’un relevé transmis par SMS (canal bas débit, 62% des échanges).
          La mesure alimente directement le moteur de seuils.
        </p>
      </div>

      <Card className="mx-auto max-w-sm">
        <CardHeader title="Téléphone patient" description="Envoyer une constante par SMS." />
        <CardBody className="space-y-4">
          <TextField
            name="patientId"
            label="Identifiant patient"
            hint="Identifiant FHIR fourni à l’accueil (M1)."
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            autoComplete="off"
          />

          {/* SMS conversation */}
          <div className="min-h-[8rem] space-y-2 rounded-xl bg-gray-50 p-3">
            {thread.length === 0 ? (
              <p className="py-6 text-center text-xs text-gray-400">
                Aucun message. Envoyez une première mesure ci-dessous.
              </p>
            ) : (
              thread.map((message) => (
                <div
                  key={message.id}
                  className={message.direction === 'out' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <span
                    className={
                      message.direction === 'out'
                        ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-clinical-600 px-3 py-2 text-sm text-white'
                        : 'max-w-[80%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-gray-800 ring-1 ring-gray-200'
                    }
                  >
                    {message.text}
                  </span>
                </div>
              ))
            )}
          </div>

          <form className="space-y-3" onSubmit={onSend}>
            <SelectField
              name="metric"
              label="Constante"
              options={METRIC_OPTIONS}
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            />
            <TextField
              name="value"
              label="Valeur"
              type="number"
              inputMode="decimal"
              hint={`Unité : ${metricUnit(metric)}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
            />
            <Button type="submit" fullWidth loading={submit.isPending}>
              Envoyer le SMS
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
