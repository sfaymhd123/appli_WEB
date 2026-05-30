import { useState, type FormEvent } from 'react';
import { TriagePriorityLabels, type SymptomSeverity } from '@hphii/fhir-domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SelectField,
  Spinner,
  Table,
  TextField,
  useToast,
  type Column,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useSubmitTriage, useTriageQueue } from '../../lib/api/hooks/use-triage';
import type { TriageQueueEntry, TriageResponse } from '../../lib/api/types/triage';
import {
  PRIORITY_TONE,
  SYMPTOM_SEVERITY_OPTIONS,
  encounterStatusLabel,
  outcomeLabel,
  referenceId,
  shortTime,
} from './triage-display';

export function TriagePage() {
  const { toast } = useToast();
  const submit = useSubmitTriage();
  const queue = useTriageQueue();

  const [patientId, setPatientId] = useState('');
  const [systolicBp, setSystolicBp] = useState('');
  const [diastolicBp, setDiastolicBp] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [glucose, setGlucose] = useState('');
  const [symptomSeverity, setSymptomSeverity] = useState('');
  const [complaint, setComplaint] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patientId.trim()) {
      toast('Renseignez l’identifiant du patient.', 'warning');
      return;
    }
    try {
      const result = await submit.mutateAsync({
        patientId: patientId.trim(),
        systolicBp: toNum(systolicBp),
        diastolicBp: toNum(diastolicBp),
        heartRate: toNum(heartRate),
        glucose: toNum(glucose),
        symptomSeverity: (symptomSeverity || undefined) as SymptomSeverity | undefined,
        complaint: complaint.trim() || undefined,
      });
      toast(
        result.critical
          ? `Priorité ${result.priority} — alerte critique déclenchée.`
          : `Priorité ${result.priority} assignée.`,
        result.critical ? 'error' : 'success',
      );
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  const result = submit.data;

  const columns: Column<TriageQueueEntry>[] = [
    {
      key: 'priority',
      header: 'Priorité',
      render: (e) =>
        e.priority ? <Badge tone={PRIORITY_TONE[e.priority]}>{e.priority}</Badge> : '—',
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (e) => (
        <span className="font-mono text-xs">{referenceId(e.patientReference) ?? '—'}</span>
      ),
    },
    { key: 'status', header: 'Statut', render: (e) => encounterStatusLabel(e.status) },
    { key: 'start', header: 'Heure', render: (e) => shortTime(e.start) },
    { key: 'outcome', header: 'Issue', render: (e) => outcomeLabel(e.outcome) ?? '—' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Triage</h1>
        <p className="mt-1 text-sm text-gray-600">Module M2 — Priorisation algorithmique (P1–P5).</p>
      </div>

      <Card>
        <CardHeader
          title="Nouveau triage"
          description="Saisir les constantes et la sévérité des symptômes ; la priorité est calculée automatiquement."
        />
        <CardBody>
          <form className="space-y-5" onSubmit={onSubmit}>
            <TextField
              name="patientId"
              label="Identifiant FHIR du patient"
              hint="Identifiant logique renvoyé par le module Patients (M1)."
              required
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              autoComplete="off"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextField
                name="systolicBp"
                label="TA systolique (mmHg)"
                type="number"
                inputMode="numeric"
                value={systolicBp}
                onChange={(e) => setSystolicBp(e.target.value)}
              />
              <TextField
                name="diastolicBp"
                label="TA diastolique (mmHg)"
                type="number"
                inputMode="numeric"
                value={diastolicBp}
                onChange={(e) => setDiastolicBp(e.target.value)}
              />
              <TextField
                name="heartRate"
                label="Fréquence cardiaque (bpm)"
                type="number"
                inputMode="numeric"
                value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)}
              />
              <TextField
                name="glucose"
                label="Glycémie (mg/dL)"
                type="number"
                inputMode="numeric"
                value={glucose}
                onChange={(e) => setGlucose(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                name="symptomSeverity"
                label="Sévérité des symptômes"
                placeholder="Non précisée"
                options={SYMPTOM_SEVERITY_OPTIONS}
                value={symptomSeverity}
                onChange={(e) => setSymptomSeverity(e.target.value)}
              />
              <TextField
                name="complaint"
                label="Motif (optionnel)"
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Button type="submit" loading={submit.isPending}>
              Évaluer la priorité
            </Button>
          </form>
        </CardBody>
      </Card>

      {result && <TriageResultCard result={result} />}

      <Card>
        <CardHeader
          title="File d’attente du jour"
          description="Passages triés, du plus urgent au moins urgent."
        />
        <CardBody>
          {queue.isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" className="text-clinical-600" />
            </div>
          ) : queue.isError ? (
            <EmptyState title="File indisponible" description={errorMessage(queue.error)} />
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">
                {queue.data?.total ?? 0} passage(s) aujourd’hui ({queue.data?.date ?? '—'}).
              </p>
              <Table
                columns={columns}
                rows={queue.data?.entries ?? []}
                rowKey={(e) => e.encounterId || Math.random().toString(36)}
                empty="Aucun passage trié aujourd’hui."
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function TriageResultCard({ result }: { result: TriageResponse }) {
  return (
    <Card>
      <CardHeader
        title="Résultat du triage"
        description="Priorité calculée et ressources FHIR créées."
        action={<Badge tone={PRIORITY_TONE[result.priority]}>{result.priority}</Badge>}
      />
      <CardBody className="space-y-5">
        {result.critical && result.alert && (
          <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3">
            <p className="text-sm font-bold text-red-800">⚠ Alerte critique P1 déclenchée</p>
            <ul className="mt-2 space-y-1 text-sm text-red-700">
              <li>
                DetectedIssue :{' '}
                <span className="font-mono">{result.alert.detectedIssue.id ?? '—'}</span> (sévérité
                haute)
              </li>
              <li>
                SMS infirmier référent : {result.alert.sms.accepted ? 'envoyé' : 'échec'} (via{' '}
                {result.alert.sms.provider})
              </li>
              <li>Acquittement requis sous 15 min — escalade automatique (M4).</li>
            </ul>
          </div>
        )}

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Priorité</p>
          <p className="mt-1 text-sm text-gray-900">{TriagePriorityLabels[result.priority]}</p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Critères déclencheurs
          </p>
          <ul className="mt-2 space-y-1.5">
            {result.findings.map((f) => (
              <li key={f.code} className="flex items-center gap-2 text-sm text-gray-700">
                <Badge tone={PRIORITY_TONE[f.priority]}>{f.priority}</Badge>
                <span>{f.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Encounter (FHIR)" value={result.encounter.id} mono />
          <Detail label="Task (FHIR)" value={result.task.id} mono />
        </dl>
      </CardBody>
    </Card>
  );
}

function Detail({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={mono ? 'mt-0.5 font-mono text-sm text-gray-900' : 'mt-0.5 text-sm text-gray-900'}>
        {value ?? '—'}
      </dd>
    </div>
  );
}

function toNum(value: string): number | undefined {
  const t = value.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
