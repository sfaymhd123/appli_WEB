import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DocumentReference, FhirResource } from 'fhir/r4';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Modal,
  Spinner,
  useToast,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useDspRecord, useExportDocument } from '../../lib/api/hooks/use-dsp';
import { useAuth } from '../../lib/auth/auth-context';
import {
  canExportRecord,
  groupBundleByType,
  resourceSummary,
  resourceTimestamp,
  shortDateTime,
} from './dsp-display';
import { downloadDspPdf } from './dsp-pdf';

/** Decode base64 UTF-8 string (PoC helper). */
function decodeBase64Utf8(base64: string): string {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return sanitizeDocumentContent(new TextDecoder().decode(bytes));
  } catch {
    return '(Erreur de décodage du contenu)';
  }
}

function sanitizeDocumentContent(content: string): string {
  return content.replace(/urgent@hphii\.ma/gi, 'service clinique HPHII');
}

export function DspPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const role = user?.role;

  const [viewingDoc, setViewingDoc] = useState<DocumentReference | null>(null);

  const record = useDspRecord(patientId);
  const exportDoc = useExportDocument();

  async function onExport() {
    if (!patientId) return;
    try {
      const doc = await exportDoc.mutateAsync({ patientId, body: {} });
      toast(`Résumé exporté : DocumentReference/${doc.id ?? '—'}.`, 'success');
      // Auto-open the generated document for immediate feedback.
      if (doc.resourceType === 'DocumentReference') setViewingDoc(doc);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  async function onDownloadPdf() {
    if (!patientId || !record.data) return;
    await downloadDspPdf(patientId, record.data);
  }

  if (!patientId) {
    return <EmptyState title="Patient non spécifié" description="Aucun identifiant de patient." />;
  }

  const sections = groupBundleByType(record.data);


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/dsp" className="text-sm text-clinical-700 hover:underline">
            Retour au dossier partage
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Dossier de Sante Partage (DSP)</h1>
          <p className="mt-1 font-mono text-sm text-gray-500">Patient/{patientId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {record.data && (
            <Button variant="secondary" onClick={onDownloadPdf}>
              Telecharger PDF complet
            </Button>
          )}
          {role && canExportRecord(role) && (
            <Button variant="secondary" onClick={onExport} loading={exportDoc.isPending}>
              Generer resume
            </Button>
          )}
        </div>
      </div>
      {/* Record sections */}
      {record.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" className="text-clinical-600" />
        </div>
      ) : record.isError ? (
        <EmptyState title="Dossier indisponible" description={errorMessage(record.error)} />
      ) : sections.length === 0 ? (
        <EmptyState
          title="Aucune ressource visible"
          description="Aucune donnée n’est accessible pour votre rôle sur ce patient."
        />
      ) : (
        sections.map((section) => (
          <Card key={section.type}>
            <CardHeader
              title={section.label}
              action={<Badge tone="neutral">{section.resources.length}</Badge>}
            />
            <CardBody>
              <ul className="divide-y divide-gray-100">
                {section.resources.map((resource, index) => (
                  <ResourceRow
                    key={resource.id ?? `${section.type}-${index}`}
                    resource={resource}
                    onView={(r) => setViewingDoc(r)}
                  />
                ))}
              </ul>
            </CardBody>
          </Card>
        ))
      )}


      {/* Document Viewer Modal */}
      <Modal
        open={!!viewingDoc}
        onClose={() => setViewingDoc(null)}
        title={viewingDoc?.content?.[0]?.attachment?.title ?? 'Document'}
        footer={
          <div className="flex w-full items-center justify-between">
            {viewingDoc?.content?.[0]?.attachment?.data && (
              <Button
                variant="secondary"
                onClick={() => {
                  const data = viewingDoc.content![0].attachment!.data!;
                  const blob = new Blob([decodeBase64Utf8(data)], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${viewingDoc.content![0].attachment!.title || 'document'}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Télécharger (.txt)
              </Button>
            )}
            <Button onClick={() => setViewingDoc(null)}>Fermer</Button>
          </div>
        }
      >
        <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 font-mono text-sm text-gray-700">
          {viewingDoc?.content?.[0]?.attachment?.data
            ? decodeBase64Utf8(viewingDoc.content[0].attachment.data)
            : 'Aucun contenu.'}
        </div>
      </Modal>
    </div>
  );
}

function ResourceRow({
  resource,
  onView,
}: {
  resource: FhirResource;
  onView?: (r: DocumentReference) => void;
}) {
  const isDocument = resource.resourceType === 'DocumentReference';
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-900">{resourceSummary(resource)}</p>
        <p className="font-mono text-xs text-gray-400">
          {resource.resourceType}/{resource.id ?? '—'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {isDocument && onView && (
          <button
            type="button"
            onClick={() => onView(resource as DocumentReference)}
            className="text-xs font-semibold text-clinical-600 hover:underline"
          >
            Voir
          </button>
        )}
        <span className="text-xs text-gray-500">{shortDateTime(resourceTimestamp(resource))}</span>
      </div>
    </li>
  );
}

