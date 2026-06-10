import { useState } from 'react';
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
  type Column,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useGlobalDocuments } from '../../lib/api/hooks/use-dsp';
import type { DspDocumentSummary } from '../../lib/api/types/dsp';

function formatDateTime(iso?: string): string {
  if (!iso) return '-';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR');
}

function decodeDocumentContent(data?: string): string {
  if (!data) return 'Aucun contenu disponible.';

  try {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return 'Contenu du document illisible.';
  }
}

export function DocumentsPage() {
  const query = useGlobalDocuments();
  const [viewingDocument, setViewingDocument] = useState<DspDocumentSummary | null>(null);

  const columns: Column<DspDocumentSummary>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (document) => (
        <span className="text-gray-600">{formatDateTime(document.date)}</span>
      ),
    },
    {
      key: 'title',
      header: 'Titre',
      render: (document) => (
        <span className="font-medium text-gray-900">{document.title}</span>
      ),
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (document) => (
        <div>
          <p className="font-medium text-gray-900">{document.patientName}</p>
          <p className="text-xs text-gray-500">
            {document.patientMrn ?? document.patientReference ?? 'Identifiant indisponible'}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (document) => <Badge tone="neutral">{document.type}</Badge>,
    },
    {
      key: 'status',
      header: 'Statut',
      render: (document) => (
        <Badge tone={document.status === 'current' ? 'success' : 'warning'}>
          {document.status === 'current' ? 'Actuel' : document.status ?? 'Inconnu'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (document) => (
        <button
          onClick={() => setViewingDocument(document)}
          className="text-sm font-semibold text-clinical-700 hover:underline"
        >
          Voir
        </button>
      ),
    },
  ];

  const documents = query.data?.documents ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="mt-1 text-sm text-gray-600">Comptes rendus et pieces du dossier.</p>
      </div>

      <Card>
        <CardHeader
          title="Documents recents"
          description="Liste des exports et documents rattaches au DSP."
        />
        <CardBody>
          {query.isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" className="text-clinical-600" />
            </div>
          ) : query.isError ? (
            <EmptyState title="Chargement impossible" description={errorMessage(query.error)} />
          ) : documents.length === 0 ? (
            <EmptyState title="Aucun document" description="Les exports du DSP apparaitront ici." />
          ) : (
            <Table
              columns={columns}
              rows={documents}
              rowKey={(document) => document.id ?? `${document.patientReference}-${document.date}`}
            />
          )}
        </CardBody>
      </Card>

      <Modal
        open={viewingDocument !== null}
        onClose={() => setViewingDocument(null)}
        title={viewingDocument?.title ?? 'Document'}
        className="max-w-3xl"
        footer={<Button onClick={() => setViewingDocument(null)}>Fermer</Button>}
      >
        {viewingDocument && (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-card border border-gray-100 bg-gray-50 p-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Patient</p>
                <p className="mt-1 font-medium text-gray-900">{viewingDocument.patientName}</p>
                <p className="text-xs text-gray-500">{viewingDocument.patientMrn}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Date</p>
                <p className="mt-1 text-gray-900">{formatDateTime(viewingDocument.date)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Type</p>
                <p className="mt-1 text-gray-900">{viewingDocument.type}</p>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-card border border-gray-200 bg-white p-4 text-sm leading-6 text-gray-800">
              {decodeDocumentContent(viewingDocument.contentData)}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
