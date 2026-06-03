import { useMemo, useState } from 'react';
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
import { usePrescriptions, useValidatePrescription } from '../../lib/api/hooks/use-services';
import type { PrescriptionSummary } from '../../lib/api/types/services';
import {
  formatDateTime,
  patientIdFromReference,
  prescriptionStatusLabel,
  prescriptionStatusTone,
  stockLabel,
  stockTone,
} from './services-display';

/**
 * Pharmacist view (§6: Physician/Pharmacist validate prescriptions). Draft
 * MedicationRequests form the validation queue; approving sets them active,
 * rejecting cancels them with a reason. Simulated stock availability is shown
 * to support the decision. Polls so newly ordered meds surface automatically.
 */
export function PharmacistQueuePanel() {
  const { toast } = useToast();
  const query = usePrescriptions(undefined, 8000);
  const validate = useValidatePrescription();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PrescriptionSummary | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const prescriptions = useMemo(() => query.data?.prescriptions ?? [], [query.data]);
  const queue = useMemo(() => prescriptions.filter((p) => p.status === 'draft'), [prescriptions]);
  const processed = useMemo(
    () => prescriptions.filter((p) => p.status !== 'draft'),
    [prescriptions],
  );

  async function approve(prescription: PrescriptionSummary) {
    setPendingId(prescription.id);
    try {
      await validate.mutateAsync({
        medicationRequestId: prescription.id,
        body: { decision: 'approve' },
      });
      toast(`Prescription validée — ${prescription.medication}`, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setPendingId(null);
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    const note = rejectNote.trim();
    if (!note) {
      toast('Indiquez le motif du refus.', 'warning');
      return;
    }
    setPendingId(rejectTarget.id);
    try {
      await validate.mutateAsync({
        medicationRequestId: rejectTarget.id,
        body: { decision: 'reject', note },
      });
      toast(`Prescription rejetée — ${rejectTarget.medication}`, 'success');
      setRejectTarget(null);
      setRejectNote('');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setPendingId(null);
    }
  }

  const queueColumns: Column<PrescriptionSummary>[] = [
    {
      key: 'medication',
      header: 'Médicament',
      render: (p) => (
        <div>
          <p className="font-medium text-gray-900">{p.medication}</p>
          {p.dosageInstruction && <p className="text-xs text-gray-500">{p.dosageInstruction}</p>}
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantité',
      render: (p) => (p.quantity ? `${p.quantity} ${p.quantityUnit ?? ''}`.trim() : '—'),
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (p) => (
        <span className="font-mono text-xs">{patientIdFromReference(p.patientReference) ?? '—'}</span>
      ),
    },
    {
      key: 'availability',
      header: 'Disponibilité',
      render: (p) => (
        <span className="inline-flex items-center gap-2">
          <Badge tone={stockTone(p.availability.status)}>{stockLabel(p.availability.status)}</Badge>
          <span className="text-xs text-gray-500">{p.availability.onHand} u.</span>
        </span>
      ),
    },
    { key: 'authoredOn', header: 'Demandée le', render: (p) => formatDateTime(p.authoredOn) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            loading={pendingId === p.id && validate.isPending}
            disabled={pendingId !== null}
            onClick={() => approve(p)}
          >
            Valider
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={pendingId !== null}
            onClick={() => {
              setRejectTarget(p);
              setRejectNote('');
            }}
          >
            Rejeter
          </Button>
        </div>
      ),
    },
  ];

  const historyColumns: Column<PrescriptionSummary>[] = [
    {
      key: 'medication',
      header: 'Médicament',
      render: (p) => <span className="font-medium text-gray-900">{p.medication}</span>,
    },
    {
      key: 'status',
      header: 'Statut',
      render: (p) => (
        <Badge tone={prescriptionStatusTone(p.status)}>{prescriptionStatusLabel(p.status)}</Badge>
      ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (p) => <span className="text-xs text-gray-500">{p.note ?? '—'}</span>,
    },
    { key: 'authoredOn', header: 'Demandée le', render: (p) => formatDateTime(p.authoredOn) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Validation des prescriptions</h1>
        <p className="mt-1 text-sm text-gray-600">
          File de validation pharmacien : approuvez ou refusez les demandes de médicaments. La
          disponibilité indiquée est une simulation de stock (PoC).
        </p>
      </div>

      <Card>
        <CardHeader
          title="File de validation"
          description="Prescriptions en attente (statut brouillon)."
          action={<Badge tone={queue.length ? 'warning' : 'neutral'}>{queue.length} en attente</Badge>}
        />
        <CardBody>
          {query.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size="lg" className="text-clinical-600" />
            </div>
          ) : query.isError ? (
            <EmptyState title="Chargement impossible" description={errorMessage(query.error)} />
          ) : (
            <Table
              columns={queueColumns}
              rows={queue}
              rowKey={(p) => p.id}
              empty="Aucune prescription en attente de validation."
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Historique récent" description="Prescriptions déjà traitées." />
        <CardBody>
          <Table
            columns={historyColumns}
            rows={processed}
            rowKey={(p) => p.id}
            empty="Aucune prescription traitée pour le moment."
          />
        </CardBody>
      </Card>

      <Modal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="Rejeter la prescription"
        dismissible={pendingId === null}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setRejectTarget(null)}
              disabled={pendingId !== null}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={pendingId === rejectTarget?.id && validate.isPending}
              onClick={confirmReject}
            >
              Confirmer le refus
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {rejectTarget && (
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{rejectTarget.medication}</span>
              {rejectTarget.dosageInstruction ? ` — ${rejectTarget.dosageInstruction}` : ''}
            </p>
          )}
          <TextField
            name="rejectNote"
            label="Motif du refus"
            placeholder="ex. Interaction médicamenteuse"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            required
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
}
