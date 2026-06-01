import {
  ALL_ROLES,
  DspAction,
  Role,
  RoleLabels,
  allowedResourcesForRole,
  canPerform,
  type DspAction as DspActionType,
  type FilteredResourceType,
} from '@hphii/fhir-domain';
import { Badge } from '../../components/ui/badge';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { Spinner } from '../../components/ui/spinner';
import { useAuth } from '../../lib/auth/auth-context';
import { useCapabilityStatement } from '../../lib/api/hooks/use-capability-statement';
import { useKpis } from '../../lib/api/hooks/use-kpis';

const RESOURCE_LABELS: Record<FilteredResourceType, string> = {
  Patient: 'Patients',
  CarePlan: 'Plans de soins',
  Observation: 'Observations / monitoring',
  DetectedIssue: 'Alertes',
  DocumentReference: 'Documents',
  DiagnosticReport: 'Résultats de laboratoire',
  MedicationRequest: 'Prescriptions',
  AuditEvent: 'Journal d’audit',
};

const ACTION_LABELS: Record<DspActionType, string> = {
  [DspAction.READ_RECORD]: 'Consulter le dossier',
  [DspAction.MODIFY_CLINICAL_RECORD]: 'Modifier le dossier clinique',
  [DspAction.ADD_BIOLOGICAL_RESULT]: 'Ajouter un résultat biologique',
  [DspAction.VALIDATE_PRESCRIPTION]: 'Valider une prescription',
  [DspAction.EXPORT_RECORD]: 'Exporter le dossier',
  [DspAction.ARCHIVE_RECORD]: 'Archiver le dossier',
};

function ServerStatusCard() {
  const { data, isLoading, isError } = useCapabilityStatement();

  return (
    <Card>
      <CardHeader title="Serveur FHIR" description="Connexion au référentiel HAPI FHIR R4." />
      <CardBody>
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-600">
            <Spinner size="sm" className="text-clinical-600" />
            <span className="text-sm">Connexion au serveur…</span>
          </div>
        )}
        {isError && (
          <div className="flex items-center gap-2">
            <Badge tone="danger">Indisponible</Badge>
            <span className="text-sm text-gray-500">Le référentiel FHIR est injoignable.</span>
          </div>
        )}
        {data && (
          <div className="space-y-1 text-sm text-gray-700">
            <div className="flex items-center gap-2">
              <Badge tone="success">Connecté</Badge>
              <span>{data.software?.name ?? 'HAPI FHIR'}</span>
            </div>
            <p className="text-gray-500">
              FHIR {data.fhirVersion ?? '4.0.1'}
              {data.software?.version ? ` · v${data.software.version}` : ''}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  if (!user || !user.role) return null;

  const kpis = useKpis();
  const showStats = user.role === Role.ADMIN || user.role === Role.PHYSICIAN;

  const resources = allowedResourcesForRole(user.role);
  const allowedActions = Object.values(DspAction).filter((action) =>
    canPerform(user.role, action),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bonjour, {RoleLabels[user.role] ?? user.role}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>{user.email || 'Utilisateur connecté'}</span>
          <Badge tone="clinical">{user.role}</Badge>
        </p>
      </div>

      {showStats && kpis.data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatMiniCard label="Cohorte" value={kpis.data.cohortSize} />
          <StatMiniCard label="Parcours actifs" value={kpis.data.pathwayMix?.total ?? 0} />
          <StatMiniCard
            label="Alertes actives"
            value={(kpis.data.alerts?.pending ?? 0) + (kpis.data.alerts?.escalated ?? 0)}
            tone={(kpis.data.alerts?.escalated ?? 0) > 0 ? 'danger' : 'warning'}
          />
          <StatMiniCard label="Observations" value={kpis.data.monitoring?.observations ?? 0} />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Données accessibles"
            description=""
          />
          <CardBody>
            {resources.length === 0 ? (
              <EmptyState title="Aucune donnée accessible" />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {resources.map((r) => (
                  <li key={r}>
                    <Badge tone="clinical">{RESOURCE_LABELS[r]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Actions autorisées" description="Matrice RBAC du DSP (ARCH.md §6)." />
          <CardBody>
            {allowedActions.length === 0 ? (
              <EmptyState title="Aucune action autorisée" />
            ) : (
              <ul className="space-y-1.5 text-sm text-gray-700">
                {allowedActions.map((action) => (
                  <li key={action} className="flex items-center gap-2">
                    <span aria-hidden className="text-clinical-600">✓</span>
                    {ACTION_LABELS[action]}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <ServerStatusCard />

        <Card>
          <CardHeader title="Rôles du système" description="Les 5 rôles RBAC (ARCH.md §6)." />
          <CardBody>
            <ul className="flex flex-wrap gap-2">
              {ALL_ROLES.map((role) => (
                <li key={role}>
                  <Badge tone={role === user.role ? 'clinical' : 'neutral'}>
                    {RoleLabels[role]}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function StatMiniCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'warning' | 'danger';
}) {
  const tones = {
    neutral: 'text-gray-900',
    warning: 'text-amber-600',
    danger: 'text-red-600',
  };

  return (
    <Card>
      <CardBody className="py-4">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${tones[tone]}`}>
          {value.toLocaleString('fr-FR')}
        </p>
      </CardBody>
    </Card>
  );
}
