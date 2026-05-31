import { useMemo, useState, type FormEvent } from 'react';
import type { Patient } from 'fhir/r4';
import { ServiceCategory } from '@hphii/fhir-domain';
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
  type SelectOption,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { hasPatientFilter, usePatientSearch } from '../../lib/api/hooks/use-patients';
import {
  useAbnormalNotifications,
  useCreateMedicationRequest,
  useCreateServiceRequest,
  useDiagnosticReports,
} from '../../lib/api/hooks/use-services';
import type { PatientSearchFilters } from '../../lib/api/types/patient';
import type { DiagnosticReportSummary, ServiceNotificationEvent } from '../../lib/api/types/services';
import { patientDisplayName, patientMrn } from '../patients/patient-display';
import {
  COMMON_STUDIES,
  PRIORITY_OPTIONS,
  SERVICE_CATEGORY_OPTIONS,
  formatDateTime,
  serviceCategoryLabel,
  serviceCategoryTone,
} from './services-display';

interface SelectedPatient {
  id: string;
  label: string;
}

/**
 * Physician view (§6: only Physician orders meds/studies). Pick a patient, then
 * order a medication (→ draft MedicationRequest for pharmacist validation) or a
 * lab/imaging study (→ active ServiceRequest for the lab worklist). Abnormal
 * results raise an in-app notification here (polling fallback) in addition to
 * the SMS the gateway sends.
 */
export function PhysicianServicesPanel() {
  const { toast } = useToast();

  /* ----- patient selection ----- */
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [filters, setFilters] = useState<PatientSearchFilters>({});
  const [patient, setPatient] = useState<SelectedPatient | null>(null);
  const search = usePatientSearch(filters);

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ identifier: identifier.trim() || undefined, name: name.trim() || undefined });
  }

  function selectPatient(p: Patient) {
    if (!p.id) return;
    const mrn = patientMrn(p);
    setPatient({ id: p.id, label: `${patientDisplayName(p)}${mrn ? ` · ${mrn}` : ''}` });
    setFilters({});
    setIdentifier('');
    setName('');
  }

  /* ----- queries ----- */
  const reports = useDiagnosticReports(15000);
  const notifications = useAbnormalNotifications(10000);
  const abnormalEvents = useMemo(
    () => (notifications.data ?? []).slice(0, 5),
    [notifications.data],
  );

  /* ----- medication order ----- */
  const createMed = useCreateMedicationRequest();
  const [medication, setMedication] = useState('');
  const [dosage, setDosage] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quantityUnit, setQuantityUnit] = useState('');
  const [medNote, setMedNote] = useState('');

  async function submitMedication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient) return;
    if (!medication.trim() || !dosage.trim()) {
      toast('Renseignez le médicament et la posologie.', 'warning');
      return;
    }
    const qty = quantity.trim() ? Number(quantity) : undefined;
    if (qty !== undefined && (!Number.isInteger(qty) || qty < 1)) {
      toast('La quantité doit être un entier positif.', 'warning');
      return;
    }
    try {
      const result = await createMed.mutateAsync({
        patientId: patient.id,
        medication: medication.trim(),
        dosageInstruction: dosage.trim(),
        quantity: qty,
        quantityUnit: quantityUnit.trim() || undefined,
        note: medNote.trim() || undefined,
      });
      toast(
        `Prescription créée — à valider par le pharmacien (stock : ${result.availability.onHand} u.).`,
        'success',
      );
      setMedication('');
      setDosage('');
      setQuantity('');
      setQuantityUnit('');
      setMedNote('');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  /* ----- lab/imaging order ----- */
  const createOrder = useCreateServiceRequest();
  const [category, setCategory] = useState<ServiceCategory>(ServiceCategory.LABORATORY);
  const [display, setDisplay] = useState('');
  const [loinc, setLoinc] = useState('');
  const [priority, setPriority] = useState('routine');
  const [orderNote, setOrderNote] = useState('');

  const presetOptions: SelectOption[] = useMemo(
    () =>
      COMMON_STUDIES.filter((study) => study.category === category).map((study) => ({
        value: study.loinc,
        label: study.display,
      })),
    [category],
  );

  function applyPreset(value: string) {
    const study = COMMON_STUDIES.find((s) => s.loinc === value);
    if (study) {
      setDisplay(study.display);
      setLoinc(study.loinc);
    }
  }

  function changeCategory(value: string) {
    setCategory(value as ServiceCategory);
    setDisplay('');
    setLoinc('');
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient) return;
    if (!display.trim()) {
      toast('Indiquez l’examen demandé.', 'warning');
      return;
    }
    try {
      await createOrder.mutateAsync({
        patientId: patient.id,
        category,
        display: display.trim(),
        loinc: loinc.trim() || undefined,
        priority: priority as 'routine' | 'urgent' | 'asap' | 'stat',
        note: orderNote.trim() || undefined,
      });
      toast(`Examen demandé — ${display.trim()} (${serviceCategoryLabel(category)}).`, 'success');
      setDisplay('');
      setLoinc('');
      setPriority('routine');
      setOrderNote('');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  /* ----- patient search results ----- */
  const patientColumns: Column<Patient>[] = [
    {
      key: 'mrn',
      header: 'Identifiant',
      render: (p) => <span className="font-mono text-xs">{patientMrn(p) ?? '—'}</span>,
    },
    {
      key: 'name',
      header: 'Nom',
      render: (p) => <span className="font-medium text-gray-900">{patientDisplayName(p)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <Button size="sm" variant="secondary" onClick={() => selectPatient(p)} disabled={!p.id}>
          Sélectionner
        </Button>
      ),
    },
  ];

  const reportColumns: Column<DiagnosticReportSummary>[] = [
    {
      key: 'label',
      header: 'Examen',
      render: (r) => (
        <div>
          <p className="font-medium text-gray-900">{r.label ?? r.loinc ?? '—'}</p>
          {r.conclusion && <p className="text-xs text-gray-500">{r.conclusion}</p>}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Catégorie',
      render: (r) => <Badge tone={serviceCategoryTone(r.category)}>{serviceCategoryLabel(r.category)}</Badge>,
    },
    {
      key: 'abnormal',
      header: 'Interprétation',
      render: (r) =>
        r.abnormal ? <Badge tone="danger">Anormal</Badge> : <Badge tone="success">Normal</Badge>,
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (r) => <span className="font-mono text-xs">{r.patientReference?.split('/')[1] ?? '—'}</span>,
    },
    { key: 'issued', header: 'Émis le', render: (r) => formatDateTime(r.issued) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Services médico-techniques (M5)</h1>
        <p className="mt-1 text-sm text-gray-600">
          Prescrivez des médicaments (validés par le pharmacien) et demandez des examens de
          laboratoire ou d’imagerie. Les résultats anormaux vous sont notifiés.
        </p>
      </div>

      {/* Abnormal-result notifications (in-app polling fallback; SMS is sent server-side). */}
      {abnormalEvents.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Badge tone="danger">Résultats anormaux</Badge> Notifications récentes
              </span>
            }
            description="Examens nécessitant votre revue (PHI-safe : la valeur mesurée n’est jamais transmise par SMS)."
          />
          <CardBody>
            <ul className="space-y-2">
              {abnormalEvents.map((event: ServiceNotificationEvent, index) => (
                <li
                  key={`${event.diagnosticReportId ?? 'evt'}-${event.at}-${index}`}
                  className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                >
                  <span className="text-gray-800">{event.message}</span>
                  <span className="shrink-0 text-xs text-gray-500">{formatDateTime(event.at)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Patient selection drives both order forms. */}
      <Card>
        <CardHeader
          title="Patient"
          description="Recherchez puis sélectionnez le patient concerné par la prescription ou la demande."
          action={
            patient ? (
              <Button size="sm" variant="ghost" onClick={() => setPatient(null)}>
                Changer
              </Button>
            ) : undefined
          }
        />
        <CardBody>
          {patient ? (
            <div className="flex items-center gap-3 rounded-lg border border-clinical-200 bg-clinical-50 px-4 py-3">
              <Badge tone="clinical">Sélectionné</Badge>
              <span className="font-medium text-gray-900">{patient.label}</span>
              <span className="font-mono text-xs text-gray-500">Patient/{patient.id}</span>
            </div>
          ) : (
            <div className="space-y-4">
              <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={onSearch}>
                <TextField
                  name="identifier"
                  label="Identifiant"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="off"
                />
                <TextField
                  name="name"
                  label="Nom"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                />
                <div className="flex items-end">
                  <Button type="submit" loading={search.isFetching && hasPatientFilter(filters)}>
                    Rechercher
                  </Button>
                </div>
              </form>

              {!hasPatientFilter(filters) ? (
                <p className="text-sm text-gray-500">
                  Saisissez un identifiant ou un nom, puis lancez la recherche.
                </p>
              ) : search.isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner size="lg" className="text-clinical-600" />
                </div>
              ) : search.isError ? (
                <EmptyState title="Recherche impossible" description={errorMessage(search.error)} />
              ) : (
                <Table
                  columns={patientColumns}
                  rows={search.data?.patients ?? []}
                  rowKey={(p) => p.id ?? patientMrn(p) ?? Math.random().toString(36)}
                  empty="Aucun patient ne correspond à ces critères."
                />
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pharmacy order */}
        <Card>
          <CardHeader title="Prescrire un médicament" description="Crée une demande à valider par le pharmacien." />
          <CardBody>
            <form className="space-y-4" onSubmit={submitMedication}>
              <TextField
                name="medication"
                label="Médicament"
                placeholder="ex. Metformine 500 mg"
                value={medication}
                onChange={(e) => setMedication(e.target.value)}
                required
              />
              <TextField
                name="dosage"
                label="Posologie"
                placeholder="ex. 1 comprimé matin et soir"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                required
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  name="quantity"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  label="Quantité"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <TextField
                  name="quantityUnit"
                  label="Unité"
                  placeholder="ex. comprimé"
                  value={quantityUnit}
                  onChange={(e) => setQuantityUnit(e.target.value)}
                />
              </div>
              <TextField
                name="medNote"
                label="Note (optionnel)"
                value={medNote}
                onChange={(e) => setMedNote(e.target.value)}
              />
              <Button type="submit" fullWidth loading={createMed.isPending} disabled={!patient}>
                Prescrire
              </Button>
              {!patient && <p className="text-xs text-gray-500">Sélectionnez d’abord un patient.</p>}
            </form>
          </CardBody>
        </Card>

        {/* Lab / imaging order */}
        <Card>
          <CardHeader title="Demander un examen" description="Laboratoire ou imagerie → file de travail du laborantin." />
          <CardBody>
            <form className="space-y-4" onSubmit={submitOrder}>
              <SelectField
                name="category"
                label="Catégorie"
                options={SERVICE_CATEGORY_OPTIONS}
                value={category}
                onChange={(e) => changeCategory(e.target.value)}
              />
              <SelectField
                name="preset"
                label="Type d’examen (préréglages)"
                placeholder="Choisir un examen courant…"
                options={presetOptions}
                value={loinc}
                onChange={(e) => applyPreset(e.target.value)}
              />
              <TextField
                name="display"
                label="Libellé de l’examen"
                placeholder="ex. HbA1c"
                value={display}
                onChange={(e) => setDisplay(e.target.value)}
                required
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  name="loinc"
                  label="Code LOINC (optionnel)"
                  placeholder="ex. 4548-4"
                  value={loinc}
                  onChange={(e) => setLoinc(e.target.value)}
                />
                <SelectField
                  name="priority"
                  label="Priorité"
                  options={PRIORITY_OPTIONS}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
              </div>
              <TextField
                name="orderNote"
                label="Note (optionnel)"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
              />
              <Button type="submit" fullWidth loading={createOrder.isPending} disabled={!patient}>
                Demander l’examen
              </Button>
              {!patient && <p className="text-xs text-gray-500">Sélectionnez d’abord un patient.</p>}
            </form>
          </CardBody>
        </Card>
      </div>

      {/* Results surface back to the ordering physician. */}
      <Card>
        <CardHeader
          title="Résultats récents"
          description="Comptes rendus diagnostiques ; les résultats anormaux sont mis en évidence."
        />
        <CardBody>
          {reports.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size="lg" className="text-clinical-600" />
            </div>
          ) : reports.isError ? (
            <EmptyState title="Chargement impossible" description={errorMessage(reports.error)} />
          ) : (
            <Table
              columns={reportColumns}
              rows={reports.data?.reports ?? []}
              rowKey={(r) => r.id}
              empty="Aucun résultat disponible."
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
