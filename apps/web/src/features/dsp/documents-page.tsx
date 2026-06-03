import type { DocumentReference } from 'fhir/r4';
import { Badge, Card, CardBody, CardHeader, EmptyState, Spinner, Table, type Column } from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useGlobalDocuments } from '../../lib/api/hooks/use-dsp';

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR');
}

function referenceId(ref?: string): string {
  if (!ref) return '—';
  return ref.split('/').pop() ?? ref;
}

export function DocumentsPage() {
  const query = useGlobalDocuments();

  const columns: Column<DocumentReference>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (d) => <span className="text-gray-600">{formatDateTime(d.date)}</span>,
    },
    {
      key: 'title',
      header: 'Titre',
      render: (d) => (
        <span className="font-medium text-gray-900">
          {d.content[0]?.attachment.title ?? d.description ?? 'Sans titre'}
        </span>
      ),
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (d) => <span className="font-mono text-xs">{referenceId(d.subject?.reference)}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (d) => <Badge tone="neutral">{d.type?.text ?? 'Document'}</Badge>,
    },
    {
      key: 'status',
      header: 'Statut',
      render: (d) => (
        <Badge tone={d.status === 'current' ? 'success' : 'warning'}>
          {d.status === 'current' ? 'Actuel' : d.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (d) => (
        <button
          onClick={() => {
            const data = d.content[0]?.attachment.data;
            if (data) {
              const text = atob(data);
              alert(text);
            }
          }}
          className="text-sm font-semibold text-clinical-700 hover:underline"
        >
          Voir
        </button>
      ),
    },
  ];

  const documents = query.data?.entry?.map((e) => e.resource).filter((r): r is DocumentReference => r !== undefined) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="mt-1 text-sm text-gray-600">Comptes rendus et pièces du dossier.</p>
      </div>

      <Card>
        <CardHeader title="Documents récents" description="Liste des exports et documents rattachés au DSP." />
        <CardBody>
          {query.isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" className="text-clinical-600" />
            </div>
          ) : query.isError ? (
            <EmptyState title="Chargement impossible" description={errorMessage(query.error)} />
          ) : documents.length === 0 ? (
            <EmptyState title="Aucun document" description="Les exports du DSP apparaîtront ici." />
          ) : (
            <Table
              columns={columns}
              rows={documents}
              rowKey={(d) => d.id ?? Math.random().toString()}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
