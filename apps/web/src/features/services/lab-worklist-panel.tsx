import { useMemo, useState } from 'react';
import { ServiceCategory } from '@hphii/fhir-domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Modal,
  Spinner,
  Table,
  TextField,
  useToast,
  type Column,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useCreateDiagnosticReport, useServiceRequests, useDiagnosticReports } from '../../lib/api/hooks/use-services';
import type { DiagnosticReportSummary, ServiceOrderSummary } from '../../lib/api/types/services';
import {
  formatDateTime,
  patientIdFromReference,
  priorityLabel,
  priorityTone,
  serviceCategoryLabel,
  serviceCategoryTone,
  studyByLoinc,
} from './services-display';

interface ResultForm {
  value: string;
  unit: string;
  valueText: string;
  abnormal: boolean;
  conclusion: string;
  /** Captured only when the originating order has no LOINC (the report requires one). */
  loinc: string;
}

const EMPTY_FORM: ResultForm = {
  value: '',
  unit: '',
  valueText: '',
  abnormal: false,
  conclusion: '',
  loinc: '',
};

/**
 * Lab-Technician view (§6: only Lab-Technician adds biological results).
 * The active ServiceRequests form the worklist; recording a result creates an
 * Observation + DiagnosticReport. Numeric values are auto-evaluated against the
 * §7 thresholds at the gateway; the abnormal toggle forces an alert for
 * qualitative/imaging findings. An abnormal report notifies the ordering
 * physician (SMS + in-app) — the technician simply sees a confirmation.
 */
export function LabWorklistPanel() {
  const { toast } = useToast();
  const worklist = useServiceRequests('active', 10000);
  const reports = useDiagnosticReports(15000);
  const createReport = useCreateDiagnosticReport();

  const [target, setTarget] = useState<ServiceOrderSummary | null>(null);
  const [form, setForm] = useState<ResultForm>(EMPTY_FORM);

  const orders = useMemo(() => worklist.data?.orders ?? [], [worklist.data]);
  const recentReports = useMemo(() => reports.data?.reports ?? [], [reports.data]);

  function openResult(order: ServiceOrderSummary) {
    setTarget(order);
    setForm({ ...EMPTY_FORM, unit: studyByLoinc(order.loinc)?.unit ?? '' });
  }

  function patch(next: Partial<ResultForm>) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  async function submitResult() {
    if (!target) return;
    const patientId = patientIdFromReference(target.patientReference);
    if (!patientId) {
      toast('Patient introuvable pour cette demande.', 'error');
      return;
    }
    const hasNumeric = form.value.trim() !== '';
    const hasText = form.valueText.trim() !== '';
    if (!hasNumeric && !hasText) {
      toast('Saisissez une valeur numérique ou un compte rendu textuel.', 'warning');
      return;
    }
    const numericValue = Number(form.value);
    if (hasNumeric && Number.isNaN(numericValue)) {
      toast('La valeur numérique est invalide.', 'warning');
      return;
    }
    const effectiveLoinc = (target.loinc?.trim() || form.loinc.trim());
    if (!effectiveLoinc) {
      toast('Un code LOINC est requis pour enregistrer ce résultat.', 'warning');
      return;
    }

    try {
      const result = await createReport.mutateAsync({
        patientId,
        serviceRequestId: target.id,
        category: target.category ?? ServiceCategory.LABORATORY,
        loinc: effectiveLoinc,
        display: target.display,
        value: hasNumeric ? numericValue : undefined,
        unit: hasNumeric && form.unit.trim() ? form.unit.trim() : undefined,
        valueText: hasText ? form.valueText.trim() : undefined,
        // Send the abnormal flag only when ticked, so numeric results still get
        // auto-evaluated against the §7 thresholds at the gateway.
        abnormal: form.abnormal ? true : undefined,
        conclusion: form.conclusion.trim() || undefined,
      });
      if (result.abnormal) {
        toast('Résultat anormal enregistré — médecin prescripteur notifié.', 'warning');
      } else {
        toast('Résultat enregistré.', 'success');
      }
      setTarget(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  const missingLoinc = target?.loinc === undefined || target.loinc === '';

  const worklistColumns: Column<ServiceOrderSummary>[] = [
    {
      key: 'display',
      header: 'Examen',
      render: (o) => (
        <div>
          <p className="font-medium text-gray-900">{o.display}</p>
          {o.note && <p className="text-xs text-gray-500">{o.note}</p>}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Catégorie',
      render: (o) => <Badge tone={serviceCategoryTone(o.category)}>{serviceCategoryLabel(o.category)}</Badge>,
    },
    { key: 'loinc', header: 'LOINC', render: (o) => <span className="font-mono text-xs">{o.loinc ?? '—'}</span> },
    {
      key: 'priority',
      header: 'Priorité',
      render: (o) =>
        o.priority ? <Badge tone={priorityTone(o.priority)}>{priorityLabel(o.priority)}</Badge> : '—',
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (o) => (
        <span className="font-mono text-xs">{patientIdFromReference(o.patientReference) ?? '—'}</span>
      ),
    },
    { key: 'authoredOn', header: 'Demandé le', render: (o) => formatDateTime(o.authoredOn) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (o) => (
        <Button size="sm" onClick={() => openResult(o)}>
          Saisir un résultat
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
    { key: 'issued', header: 'Émis le', render: (r) => formatDateTime(r.issued) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Laboratoire & imagerie (M5)</h1>
        <p className="mt-1 text-sm text-gray-600">
          File de travail laborantin : saisissez les résultats des examens demandés. Un résultat
          anormal alerte automatiquement le médecin prescripteur.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Examens à réaliser"
          description="Demandes actives (laboratoire et imagerie)."
          action={<Badge tone={orders.length ? 'warning' : 'neutral'}>{orders.length} en attente</Badge>}
        />
        <CardBody>
          {worklist.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size="lg" className="text-clinical-600" />
            </div>
          ) : worklist.isError ? (
            <EmptyState title="Chargement impossible" description={errorMessage(worklist.error)} />
          ) : (
            <Table
              columns={worklistColumns}
              rows={orders}
              rowKey={(o) => o.id}
              empty="Aucun examen en attente."
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Résultats récents" description="Comptes rendus enregistrés (les plus récents d’abord)." />
        <CardBody>
          {reports.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size="lg" className="text-clinical-600" />
            </div>
          ) : (
            <Table
              columns={reportColumns}
              rows={recentReports}
              rowKey={(r) => r.id}
              empty="Aucun résultat enregistré."
            />
          )}
        </CardBody>
      </Card>

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title="Saisir un résultat"
        dismissible={!createReport.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={createReport.isPending}>
              Annuler
            </Button>
            <Button loading={createReport.isPending} onClick={submitResult}>
              Enregistrer le résultat
            </Button>
          </>
        }
      >
        {target && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
              <p className="font-semibold text-gray-900">{target.display}</p>
              <p className="text-xs text-gray-500">
                {serviceCategoryLabel(target.category)} · LOINC {target.loinc ?? '—'} · Patient{' '}
                {patientIdFromReference(target.patientReference) ?? '—'}
              </p>
            </div>

            {missingLoinc && (
              <TextField
                name="loinc"
                label="Code LOINC"
                hint="La demande n’a pas de code LOINC ; précisez-le pour le compte rendu."
                placeholder="ex. 4548-4"
                value={form.loinc}
                onChange={(e) => patch({ loinc: e.target.value })}
                required
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="value"
                type="number"
                step="any"
                inputMode="decimal"
                label="Valeur (numérique)"
                hint="Évaluée automatiquement selon les seuils §7."
                value={form.value}
                onChange={(e) => patch({ value: e.target.value })}
              />
              <TextField
                name="unit"
                label="Unité"
                placeholder="ex. %, mg/dL"
                value={form.unit}
                onChange={(e) => patch({ unit: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="valueText" className="block text-sm font-medium text-gray-700">
                Compte rendu / résultat textuel
              </label>
              <textarea
                id="valueText"
                name="valueText"
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 shadow-sm transition-colors focus:border-clinical-600 focus:outline-none focus:ring-2 focus:ring-clinical-600/30"
                placeholder="ex. Opacité du lobe inférieur droit"
                value={form.valueText}
                onChange={(e) => patch({ valueText: e.target.value })}
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-clinical-700 focus:ring-clinical-600/30"
                checked={form.abnormal}
                onChange={(e) => patch({ abnormal: e.target.checked })}
              />
              <span>
                Marquer comme <span className="font-semibold">anormal</span> (imagerie / résultat
                qualitatif). Les valeurs numériques sont aussi évaluées automatiquement.
              </span>
            </label>

            <div className="space-y-1">
              <label htmlFor="conclusion" className="block text-sm font-medium text-gray-700">
                Conclusion (optionnel)
              </label>
              <textarea
                id="conclusion"
                name="conclusion"
                rows={2}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 shadow-sm transition-colors focus:border-clinical-600 focus:outline-none focus:ring-2 focus:ring-clinical-600/30"
                value={form.conclusion}
                onChange={(e) => patch({ conclusion: e.target.value })}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
