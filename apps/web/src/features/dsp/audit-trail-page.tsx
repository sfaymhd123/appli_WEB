import { Role } from '@hphii/fhir-domain';
import { Badge, Card, CardBody, CardHeader, EmptyState, Spinner, Table, type Column } from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useAuth } from '../../lib/auth/auth-context';
import { useGlobalAudit } from '../../lib/api/hooks/use-dsp';
import type { DspAuditEntry } from '../../lib/api/types/dsp';

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR');
}

function referenceId(ref?: string): string {
  if (!ref) return '—';
  return ref.split('/').pop() ?? ref;
}

const OUTCOME_LABEL: Record<string, string> = {
  '0': 'Succès',
  '4': 'Échec mineur',
  '8': 'Échec majeur',
  '12': 'Échec critique',
};

const OUTCOME_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  '0': 'success',
  '4': 'warning',
  '8': 'danger',
  '12': 'danger',
};

export function AuditTrailPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  const query = useGlobalAudit(isAdmin);

  const columns: Column<DspAuditEntry>[] = [
    {
      key: 'recorded',
      header: 'Date',
      render: (e) => <span className="text-gray-600">{formatDateTime(e.recorded)}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      render: (e) => <Badge tone="neutral">{e.action ?? 'READ'}</Badge>,
    },
    {
      key: 'actor',
      header: 'Utilisateur',
      render: (e) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900">{e.actorId ?? 'Système'}</span>
          <span className="text-xs text-gray-500">{e.actorRole ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Patient',
      render: (e) => <span className="font-mono text-xs">{referenceId(e.entity)}</span>,
    },
    {
      key: 'outcome',
      header: 'Résultat',
      render: (e) => {
        const code = String(e.outcome ?? '0');
        return <Badge tone={OUTCOME_TONE[code] ?? 'neutral'}>{OUTCOME_LABEL[code] ?? code}</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Journal d’audit</h1>
        <p className="mt-1 text-sm text-gray-600">Traçabilité des accès au DSP (IHE ATNA).</p>
      </div>

      {!isAdmin ? (
        <EmptyState
          title="Accès restreint"
          description="Seul un administrateur peut consulter le journal d’audit global."
        />
      ) : (
        <Card>
          <CardHeader title="Accès récents" description="Historique des lectures et modifications du DSP." />
          <CardBody>
            {query.isLoading ? (
              <div className="flex justify-center py-12">
                <Spinner size="lg" className="text-clinical-600" />
              </div>
            ) : query.isError ? (
              <EmptyState title="Chargement impossible" description={errorMessage(query.error)} />
            ) : query.data?.events.length === 0 ? (
              <EmptyState title="Aucun événement" description="Les accès au DSP apparaîtront ici." />
            ) : (
              <Table
                columns={columns}
                rows={query.data?.events ?? []}
                rowKey={(e) => e.id ?? Math.random().toString()}
              />
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
