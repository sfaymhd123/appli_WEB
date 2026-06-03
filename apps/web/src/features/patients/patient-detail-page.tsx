import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import type { CoverageScheme } from '@hphii/fhir-domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SelectField,
  Spinner,
  TextField,
  useToast,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useAddCoverage, usePatient } from '../../lib/api/hooks/use-patients';
import { useCreateAppointment } from '../../lib/api/hooks/use-appointments';
import type { CoverageResult } from '../../lib/api/types/patient';
import {
  COVERAGE_SCHEME_OPTIONS,
  GENDER_LABELS,
  patientDisplayName,
  patientMrn,
  patientPhone,
  patientRiskGroup,
  patientCoverage,
  patientZone,
} from './patient-display';

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const patientQuery = usePatient(id);
  const addCoverage = useAddCoverage();
  const createAppointment = useCreateAppointment();

  const [scheme, setScheme] = useState('');
  const [memberId, setMemberId] = useState('');
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);

  const [aptDate, setAptDate] = useState('');
  const [aptTime, setAptTime] = useState('');
  const [aptDesc, setAptDesc] = useState('');

  async function onAddCoverage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    try {
      const result = await addCoverage.mutateAsync({
        patientId: id,
        body: { scheme: scheme as CoverageScheme, memberId: memberId.trim() || undefined },
      });
      setCoverage(result);
      toast(
        result.eligibility.active ? 'Couverture active.' : 'Couverture inactive.',
        result.eligibility.active ? 'success' : 'warning',
      );
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  async function onBookAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !aptDate || !aptTime) return;

    try {
      const start = new Date(`${aptDate}T${aptTime}`).toISOString();
      await createAppointment.mutateAsync({
        patientId: id,
        start,
        description: aptDesc.trim() || undefined,
      });
      toast('Rendez-vous programmé et SMS envoyé au patient.', 'success');
      setAptDate('');
      setAptTime('');
      setAptDesc('');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/patients" className="text-sm text-clinical-700 hover:underline">
            ← Patients
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Dossier patient</h1>
        </div>
        {id && (
          <Link to={`/dsp/${id}`}>
            <Button variant="secondary">Consulter le DSP</Button>
          </Link>
        )}
      </div>

      {patientQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" className="text-clinical-600" />
        </div>
      ) : patientQuery.isError || !patientQuery.data ? (
        <EmptyState
          title="Patient introuvable"
          description={
            patientQuery.error ? errorMessage(patientQuery.error) : 'Aucun dossier pour cet identifiant.'
          }
        />
      ) : (
        (() => {
          const patient = patientQuery.data;
          const gender =
            patient.gender === 'male' || patient.gender === 'female'
              ? GENDER_LABELS[patient.gender]
              : (patient.gender ?? '—');
          return (
            <>
              <Card>
                <CardHeader
                  title={patientDisplayName(patient)}
                  description="Identité (M1)."
                  action={<Badge tone="clinical">{patientRiskGroup(patient) ?? '—'}</Badge>}
                />
                <CardBody>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <Detail label="Identifiant FHIR" value={patient.id} mono />
                    <Detail label="Identifiant HPHII" value={patientMrn(patient)} mono />
                    <Detail label="Sexe" value={gender} />
                    <Detail label="Année de naissance" value={patient.birthDate} />
                    <Detail label="Régime de couverture" value={patientCoverage(patient)} />
                    <Detail label="Zone de résidence" value={patientZone(patient)} />
                    <Detail label="Téléphone" value={patientPhone(patient)} />
                  </dl>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Couverture & éligibilité"
                  description="Créer une couverture RAMED/AMO/Privé et lancer une vérification (simulée)."
                />
                <CardBody className="space-y-5">
                  <form className="grid gap-4 sm:grid-cols-2" onSubmit={onAddCoverage}>
                    <SelectField
                      name="scheme"
                      label="Régime"
                      required
                      placeholder="Sélectionner…"
                      options={COVERAGE_SCHEME_OPTIONS}
                      value={scheme}
                      onChange={(e) => setScheme(e.target.value)}
                    />
                    <TextField
                      name="memberId"
                      label="N° d’assuré"
                      hint="Optionnel."
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                      autoComplete="off"
                    />
                    <div className="sm:col-span-2">
                      <Button type="submit" loading={addCoverage.isPending}>
                        Vérifier l’éligibilité
                      </Button>
                    </div>
                  </form>

                  {coverage && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-sm font-medium text-gray-700">Résultat</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone={coverage.eligibility.active ? 'success' : 'warning'}>
                          {coverage.eligibility.active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge tone="clinical">{coverage.eligibility.scheme}</Badge>
                        <span className="text-xs text-gray-500">Vérification simulée (PoC)</span>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Planifier un rendez-vous"
                  description="Module SMS — Notifier le patient de sa prochaine consultation."
                />
                <CardBody>
                  <form className="grid gap-4 sm:grid-cols-2" onSubmit={onBookAppointment}>
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
                    <div className="sm:col-span-2">
                      <TextField
                        label="Motif / Description"
                        placeholder="Ex: Suivi tensionnel…"
                        value={aptDesc}
                        onChange={(e) => setAptDesc(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Button type="submit" loading={createAppointment.isPending} className="w-full sm:w-auto">
                        <Calendar className="mr-2 h-4 w-4" />
                        Confirmer et envoyer SMS
                      </Button>
                    </div>
                  </form>
                </CardBody>
              </Card>
            </>
          );
        })()
      )}
    </div>
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
