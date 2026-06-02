import { Link } from 'react-router-dom';
import {
  Users,
  Activity,
  Bell,
  Database,
  ShieldCheck,
  CheckCircle2,
  Lock,
} from 'lucide-react';
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
    <Card hover>
      <CardHeader
        title={
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-clinical-600" />
            <span>Serveur FHIR</span>
          </div>
        }
        description="Connexion au référentiel HAPI FHIR R4."
      />
      <CardBody>
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-600">
            <Spinner size="sm" className="text-clinical-600" />
            <span className="text-sm italic">Connexion au serveur…</span>
          </div>
        )}
        {isError && (
          <div className="flex items-center gap-2 text-red-600">
            <Badge tone="danger">Indisponible</Badge>
            <span className="text-xs font-medium">Le référentiel FHIR est injoignable.</span>
          </div>
        )}
        {data && (
          <div className="space-y-1 text-sm text-gray-700">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="font-semibold text-gray-900">{data.software?.name ?? 'HAPI FHIR'}</span>
            </div>
            <p className="text-xs text-gray-400">
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
          Bonjour, {RoleLabels[user.role] ?? user.role}
        </h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-medium">{user.email || 'Utilisateur connecté'}</span>
          <span className="text-gray-300">/</span>
          <Badge tone="clinical" className="rounded-md px-1.5 py-0.5 uppercase tracking-wider text-[10px]">
            {user.role}
          </Badge>
        </div>
      </div>

      {showStats && kpis.data && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatMiniCard label="Cohorte" value={kpis.data.cohortSize} icon={Users} to="/patients" />
          <StatMiniCard label="Parcours actifs" value={kpis.data.pathwayMix?.total ?? 0} icon={Activity} to="/care-plans" />
          <StatMiniCard
            label="Alertes actives"
            value={(kpis.data.alerts?.pending ?? 0) + (kpis.data.alerts?.escalated ?? 0)}
            tone={(kpis.data.alerts?.escalated ?? 0) > 0 ? 'danger' : 'warning'}
            icon={Bell}
            to="/alerts"
          />
          <StatMiniCard label="Observations" value={kpis.data.monitoring?.observations ?? 0} icon={Database} to="/observations" />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card hover>
          <CardHeader
            tone="clinical"
            title={
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-clinical-600" />
                <span>Données accessibles</span>
              </div>
            }
            description="Selon votre profil d'habilitation."
          />
          <CardBody>
            {resources.length === 0 ? (
              <EmptyState title="Aucune donnée accessible" />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {resources.map((r) => (
                  <li key={r}>
                    <Badge tone="clinical" className="bg-white text-clinical-700 ring-1 ring-clinical-100 border-none shadow-none">
                      {RESOURCE_LABELS[r]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card hover>
          <CardHeader 
            tone="clinical"
            title={
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-clinical-600" />
                <span>Actions autorisées</span>
              </div>
            } 
            description="Matrice RBAC du DSP (ARCH.md §6)." 
          />
          <CardBody>
            {allowedActions.length === 0 ? (
              <EmptyState title="Aucune action autorisée" />
            ) : (
              <ul className="space-y-2 text-sm text-gray-700">
                {allowedActions.map((action) => (
                  <li key={action} className="flex items-center gap-2.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-clinical-500" />
                    <span className="font-medium">{ACTION_LABELS[action]}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <ServerStatusCard />

        <Card hover>
          <CardHeader 
            title={
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-clinical-600" />
                <span>Rôles du système</span>
              </div>
            } 
            description="Les 5 rôles RBAC (ARCH.md §6)." 
          />
          <CardBody>
            <ul className="flex flex-wrap gap-2">
              {ALL_ROLES.map((role) => (
                <li key={role}>
                  <Badge tone={role === user.role ? 'clinical' : 'neutral'} className={role === user.role ? 'ring-2 ring-clinical-200' : ''}>
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
  icon: Icon,
  to,
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'warning' | 'danger';
  icon?: any;
  to?: string;
}) {
  const tones = {
    neutral: 'text-gray-900',
    warning: 'text-amber-600',
    danger: 'text-red-600',
  };

  const bgTones = {
    neutral: 'bg-gray-50 text-gray-400',
    warning: 'bg-amber-50 text-amber-500',
    danger: 'bg-red-50 text-red-500',
  };

  const content = (
    <Card hover className="group relative overflow-visible h-full">
      <CardBody className="py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {label}
            </p>
            <p
              className={`mt-2 text-3xl font-extrabold tabular-nums tracking-tight ${tones[tone]}`}
            >
              {value.toLocaleString('fr-FR')}
            </p>
          </div>
          {Icon && (
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${bgTones[tone]} transition-all duration-300 group-hover:scale-110 group-hover:shadow-inner`}
            >
              <Icon className="h-6 w-6" />
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );

  if (to) {
    return (
      <Link to={to} className="block transition-transform active:scale-95">
        {content}
      </Link>
    );
  }

  return content;
}
