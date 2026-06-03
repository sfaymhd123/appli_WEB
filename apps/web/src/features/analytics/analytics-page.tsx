import {
  ALL_ROLES,
  RoleLabels,
  TRIAGE_PRIORITIES,
  TriagePriorityLabels,
  Role,
  type TriagePriority,
} from '@hphii/fhir-domain';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Spinner } from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useKpis } from '../../lib/api/hooks/use-kpis';
import { useAuth } from '../../lib/auth/auth-context';
import type { KpiReport } from '../../lib/api/types/kpis';
import { BarChart, SegmentedBar, StatCard, type BarDatum, type Segment } from './kpi-charts';
import { DemoCard } from './demo-card';

const PRIORITY_COLOR: Record<TriagePriority, string> = {
  P1: 'bg-priority-p1',
  P2: 'bg-priority-p2',
  P3: 'bg-priority-p3',
  P4: 'bg-priority-p4',
  P5: 'bg-priority-p5',
};

const ROLE_COLOR: Record<Role, string> = {
  Physician: 'bg-clinical-600',
  Nurse: 'bg-blue-500',
  Admin: 'bg-gray-500',
  Pharmacist: 'bg-green-500',
  'Lab-Technician': 'bg-amber-500',
};

const pctText = (n?: number) => `${(n ?? 0).toLocaleString('fr-FR')} %`;
const intText = (n?: number) => (n ?? 0).toLocaleString('fr-FR');

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR');
}

export function AnalyticsPage() {
  const kpis = useKpis();
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="mt-1 text-sm text-gray-600">
            {user?.role === Role.ADMIN 
              ? "Indicateurs système globaux (Cohorte complète)." 
              : `Données personnalisées pour le rôle ${user?.role ? RoleLabels[user.role] : 'chargement...'}.`}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={kpis.isFetching}
          onClick={() => void kpis.refetch()}
        >
          Actualiser
        </Button>
      </div>

      {kpis.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" className="text-clinical-600" />
        </div>
      ) : kpis.isError ? (
        <EmptyState title="Chargement impossible" description={errorMessage(kpis.error)} />
      ) : kpis.data ? (
        <KpiContent report={kpis.data} role={user?.role} />
      ) : null}
    </div>
  );
}

function KpiContent({ report, role }: { report: KpiReport, role?: Role }) {
  const isAdmin = role === Role.ADMIN;
  const isClinical = role === Role.PHYSICIAN || role === Role.NURSE;
  const isLab = role === Role.LAB_TECHNICIAN;

  const { pathwayMix, triage, monitoring, results, alerts, dspAccessByRole, demographics, staffDistribution } = report;

  const triageBars: BarDatum[] = TRIAGE_PRIORITIES.map((priority) => ({
    label: TriagePriorityLabels[priority],
    value: triage?.byPriority?.[priority] ?? 0,
    colorClass: PRIORITY_COLOR[priority],
  }));

  const roleBars: BarDatum[] = ALL_ROLES.map((role) => ({
    label: RoleLabels[role],
    value: dspAccessByRole?.[role] ?? 0,
    colorClass: ROLE_COLOR[role],
  }));

  const staffBars: BarDatum[] = ALL_ROLES.map((role) => ({
    label: RoleLabels[role],
    value: staffDistribution?.[role] ?? 0,
    colorClass: ROLE_COLOR[role],
  }));

  const zoneBars: BarDatum[] = Object.entries(demographics?.byZone ?? {}).map(([label, value]) => ({
    label,
    value: value ?? 0,
    colorClass: 'bg-clinical-600',
  }));

  const riskBars: BarDatum[] = Object.entries(demographics?.byRiskGroup ?? {}).map(
    ([label, value]) => ({
      label,
      value: value ?? 0,
      colorClass: 'bg-clinical-600',
    }),
  );

  const pathwaySegments: Segment[] = [
    { label: 'Chronique', value: pathwayMix?.chronic ?? 0, colorClass: 'bg-clinical-600' },
    { label: 'Épisodique', value: pathwayMix?.episodic ?? 0, colorClass: 'bg-blue-500' },
  ];

  const alertSegments: Segment[] = [
    { label: 'Acquittées', value: alerts?.acknowledged ?? 0, colorClass: 'bg-green-500' },
    { label: 'En attente', value: alerts?.pending ?? 0, colorClass: 'bg-amber-500' },
    { label: 'Escaladées', value: alerts?.escalated ?? 0, colorClass: 'bg-red-500' },
  ];

  const resultSegments: Segment[] = [
    {
      label: 'Normaux',
      value: Math.max(0, (results?.total ?? 0) - (results?.abnormal ?? 0)),
      colorClass: 'bg-green-500',
    },
    { label: 'Anormaux', value: results?.abnormal ?? 0, colorClass: 'bg-red-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={report.source === 'live' ? 'success' : 'warning'}>
          {report.source === 'live' ? 'Données en direct (FHIR)' : 'Données de référence (seed)'}
        </Badge>
        {isAdmin && <Badge tone="neutral">Vue Administrateur</Badge>}
        {!isAdmin && <Badge tone="clinical">Vue Personnalisée</Badge>}
        <span className="text-xs text-gray-500">Généré le {formatGeneratedAt(report.generatedAt)}</span>
      </div>

      {isClinical && (
        <div className="max-w-xl">
          <DemoCard />
        </div>
      )}

      {/* Scorecard headline metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isAdmin && (
          <StatCard label="Effectif Total" value={intText(report.staffCount)} hint="Membres du personnel" />
        )}

        {(isAdmin || isClinical) && (
          <StatCard label={isAdmin ? "Cohorte totale" : "Mes Patients"} value={intText(report.cohortSize)} hint="Patients suivis" />
        )}
        
        {(isAdmin || isLab) && (
          <StatCard label="Analyses totales" value={intText(results?.total)} hint="Examens traités" />
        )}

        {(isAdmin || isClinical) && (
          <StatCard
            label="Parcours actifs"
            value={intText(pathwayMix?.total)}
            hint={`${pctText(pathwayMix?.chronicPct)} chroniques`}
          />
        )}

        <StatCard
          label="Observations"
          value={intText(monitoring?.observations)}
          hint="Mesures vitales"
        />

        {(isAdmin || isClinical) && (
          <StatCard
            label="Triage critique"
            value={pctText(triage?.criticalPct)}
            hint={`${intText(triage?.byPriority?.P1)} cas P1`}
            tone={(triage?.criticalPct ?? 0) >= 10 ? 'danger' : 'warning'}
          />
        )}

        <StatCard
          label="Alertes actives"
          value={pctText(alerts?.unacknowledgedPct)}
          hint={`${intText(alerts?.pending)} en attente`}
          tone={(alerts?.escalated ?? 0) > 0 ? 'danger' : 'warning'}
        />

        {(isAdmin || isLab || isClinical) && (
          <StatCard
            label="Résultats anormaux"
            value={pctText(results?.abnormalPct)}
            hint={`${intText(results?.abnormal)} anomalies`}
            tone="warning"
          />
        )}
      </div>

      {/* Distribution charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {isAdmin && (
          <Card>
            <CardHeader
              title="Démographie de la cohorte"
              description="Répartition par zone de résidence."
            />
            <CardBody>
              <BarChart data={zoneBars} />
            </CardBody>
          </Card>
        )}

        {(isAdmin || isClinical) && (
          <Card>
            <CardHeader
              title="Profil de risque"
              description="Répartition par groupe de risque clinique."
            />
            <CardBody>
              <BarChart data={riskBars} />
            </CardBody>
          </Card>
        )}

        {(isAdmin || isClinical) && (
          <Card>
            <CardHeader
              title="Répartition des parcours"
              description="Chronique vs épisodique."
            />
            <CardBody>
              <SegmentedBar segments={pathwaySegments} />
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Cycle de vie des alertes"
            description="Acquittement et escalade."
            action={
              <Badge tone="success">{pctText(alerts?.acknowledgedPct)} acquittées</Badge>
            }
          />
          <CardBody>
            <SegmentedBar segments={alertSegments} />
          </CardBody>
        </Card>

        {(isAdmin || isClinical) && (
          <Card>
            <CardHeader
              title="Distribution du triage"
              description="Priorisation algorithmique."
            />
            <CardBody>
              {(triage?.total ?? 0) === 0 ? (
                <EmptyState title="Aucun cas trié" />
              ) : (
                <BarChart data={triageBars} />
              )}
            </CardBody>
          </Card>
        )}

        {isAdmin && (
          <Card>
            <CardHeader
              title="Distribution de l'effectif"
              description="Nombre de comptes par rôle RBAC."
            />
            <CardBody>
              <BarChart data={staffBars} />
            </CardBody>
          </Card>
        )}

        {isAdmin && (
          <Card>
            <CardHeader
              title="Accès au DSP par rôle"
              description="Volume d’accès audités (AuditEvent)."
            />
            <CardBody>
              <BarChart data={roleBars} />
            </CardBody>
          </Card>
        )}

        {(isAdmin || isLab || isClinical) && (
          <Card>
            <CardHeader
              title="Résultats de laboratoire"
              description="Proportion de résultats anormaux."
            />
            <CardBody>
              {(results?.total ?? 0) === 0 ? (
                <EmptyState title="Aucun compte rendu" />
              ) : (
                <SegmentedBar segments={resultSegments} />
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
