import { Link, useParams } from 'react-router-dom';
import { allowedResourcesForRole } from '@hphii/fhir-domain';
import type { FhirResource } from 'fhir/r4';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Spinner,
  Table,
  useToast,
  type Column,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useDspAudit, useDspRecord, useExportDocument } from '../../lib/api/hooks/use-dsp';
import type { DspAuditEntry } from '../../lib/api/types/dsp';
import { useAuth } from '../../lib/auth/auth-context';
import {
  auditActionLabel,
  auditOutcomeLabel,
  auditOutcomeTone,
  canExportRecord,
  canViewAudit,
  groupBundleByType,
  rbacFilterTag,
  resourceSummary,
  resourceTimestamp,
  resourceTypeLabel,
  roleLabel,
  shortDateTime,
} from './dsp-display';

export function DspPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const role = user?.role;

  const record = useDspRecord(patientId);
  const auditAllowed = role ? canViewAudit(role) : false;
  const audit = useDspAudit(patientId, auditAllowed);
  const exportDoc = useExportDocument();

  async function onExport() {
    if (!patientId) return;
    try {
      const doc = await exportDoc.mutateAsync({ patientId, body: {} });
      toast(`Résumé exporté : DocumentReference/${doc.id ?? '—'}.`, 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  if (!patientId) {
    return <EmptyState title="Patient non spécifié" description="Aucun identifiant de patient." />;
  }

  const sections = groupBundleByType(record.data);
  const filterTag = rbacFilterTag(record.data);
  const allowed = role ? allowedResourcesForRole(role) : [];

  const auditColumns: Column<DspAuditEntry>[] = [
    { key: 'action', header: 'Action', render: (e) => auditActionLabel(e.action) },
    { key: 'role', header: 'Rôle', render: (e) => roleLabel(e.actorRole) },
    {
      key: 'actor',
      header: 'Acteur',
      render: (e) => <span className="font-mono text-xs">{e.actorId ?? '—'}</span>,
    },
    {
      key: 'entity',
      header: 'Entité',
      render: (e) => <span className="font-mono text-xs">{e.entity ?? '—'}</span>,
    },
    { key: 'recorded', header: 'Horodatage', render: (e) => shortDateTime(e.recorded) },
    {
      key: 'outcome',
      header: 'Résultat',
      render: (e) => <Badge tone={auditOutcomeTone(e.outcome)}>{auditOutcomeLabel(e.outcome)}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dsp" className="text-sm text-clinical-700 hover:underline">
          ← Dossier partagé
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Dossier de Santé Partagé (DSP)</h1>
        <p className="mt-1 text-sm text-gray-600">
          Module M6 — Vue filtrée par rôle (RBAC §6) du{' '}
          <span className="font-mono">Patient/{patientId}</span>.
        </p>
      </div>

      {/* Role filter notice */}
      <Card>
        <CardHeader
          title={`Vue filtrée pour le rôle : ${roleLabel(role)}`}
          description="Le filtrage est appliqué dynamiquement par la passerelle selon votre rôle ; les sections non autorisées ne sont pas renvoyées."
          action={
            role && canExportRecord(role) ? (
              <Button variant="secondary" onClick={onExport} loading={exportDoc.isPending}>
                Exporter un résumé
              </Button>
            ) : undefined
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Ressources autorisées
            </span>
            {allowed.length === 0 ? (
              <span className="text-sm text-gray-500">—</span>
            ) : (
              allowed.map((type) => (
                <Badge key={type} tone="clinical">
                  {resourceTypeLabel(type)}
                </Badge>
              ))
            )}
          </div>
          {filterTag?.display && (
            <p className="font-mono text-xs text-gray-400">{filterTag.display}</p>
          )}
        </CardBody>
      </Card>

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
                  <ResourceRow key={resource.id ?? `${section.type}-${index}`} resource={resource} />
                ))}
              </ul>
            </CardBody>
          </Card>
        ))
      )}

      {/* Audit trail panel */}
      {auditAllowed ? (
        <Card>
          <CardHeader
            title="Journal d’audit (IHE ATNA)"
            description="Traçabilité des accès au dossier — un AuditEvent par accès (§8)."
          />
          <CardBody>
            {audit.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="md" className="text-clinical-600" />
              </div>
            ) : audit.isError ? (
              <EmptyState title="Journal indisponible" description={errorMessage(audit.error)} />
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">{audit.data?.total ?? 0} événement(s) enregistré(s).</p>
                <Table
                  columns={auditColumns}
                  rows={audit.data?.events ?? []}
                  rowKey={(e) => e.id || Math.random().toString(36)}
                  empty="Aucun accès enregistré pour ce patient."
                />
              </div>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">
              Le journal d’audit est réservé aux rôles Médecin et Administrateur.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function ResourceRow({ resource }: { resource: FhirResource }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-900">{resourceSummary(resource)}</p>
        <p className="font-mono text-xs text-gray-400">
          {resource.resourceType}/{resource.id ?? '—'}
        </p>
      </div>
      <span className="shrink-0 text-xs text-gray-500">{shortDateTime(resourceTimestamp(resource))}</span>
    </li>
  );
}
