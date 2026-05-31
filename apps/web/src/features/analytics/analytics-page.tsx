import {
  ALL_ROLES,
  RoleLabels,
  TRIAGE_PRIORITIES,
  TriagePriorityLabels,
  type Role,
  type TriagePriority,
} from '@hphii/fhir-domain';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Spinner } from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useKpis } from '../../lib/api/hooks/use-kpis';
import type { KpiReport } from '../../lib/api/types/kpis';
import { BarChart, SegmentedBar, StatCard, type BarDatum, type Segment } from './kpi-charts';

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

const pctText = (n: number) => `${n.toLocaleString('fr-FR')} %`;
const intText = (n: number) => n.toLocaleString('fr-FR');

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR');
}

/**
 * M-Analytics — Balanced-scorecard KPI dashboard (admin/physician). Reads the
 * gateway's GET /kpis, which aggregates live FHIR data (and falls back to the
 * seeder's docs/kpis.json). Charts are deliberately lightweight CSS (§11).
 */
export function AnalyticsPage() {
  const kpis = useKpis();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord analytique (KPI)</h1>
          <p className="mt-1 text-sm text-gray-600">
            Indicateurs du tableau de bord équilibré, calculés à partir des données FHIR en direct.
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
        <KpiContent report={kpis.data} />
      ) : null}
    </div>
  );
}

function KpiContent({ report }: { report: KpiReport }) {
  const { pathwayMix, triage, monitoring, results, alerts, dspAccessByRole } = report;

  const triageBars: BarDatum[] = TRIAGE_PRIORITIES.map((priority) => ({
    label: TriagePriorityLabels[priority],
    value: triage.byPriority[priority] ?? 0,
    colorClass: PRIORITY_COLOR[priority],
  }));

  const roleBars: BarDatum[] = ALL_ROLES.map((role) => ({
    label: RoleLabels[role],
    value: dspAccessByRole[role] ?? 0,
    colorClass: ROLE_COLOR[role],
  }));

  const pathwaySegments: Segment[] = [
    { label: 'Chronique', value: pathwayMix.chronic, colorClass: 'bg-clinical-600' },
    { label: 'Épisodique', value: pathwayMix.episodic, colorClass: 'bg-blue-500' },
  ];

  const alertSegments: Segment[] = [
    { label: 'Acquittées', value: alerts.acknowledged, colorClass: 'bg-green-500' },
    { label: 'En attente', value: alerts.pending, colorClass: 'bg-amber-500' },
    { label: 'Escaladées', value: alerts.escalated, colorClass: 'bg-red-500' },
  ];

  const resultSegments: Segment[] = [
    { label: 'Normaux', value: Math.max(0, results.total - results.abnormal), colorClass: 'bg-green-500' },
    { label: 'Anormaux', value: results.abnormal, colorClass: 'bg-red-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={report.source === 'live' ? 'success' : 'warning'}>
          {report.source === 'live' ? 'Données en direct (FHIR)' : 'Données de référence (seed)'}
        </Badge>
        <span className="text-xs text-gray-500">Généré le {formatGeneratedAt(report.generatedAt)}</span>
      </div>

      {/* Scorecard headline metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Cohorte" value={intText(report.cohortSize)} hint="Patients enregistrés" />
        <StatCard
          label="Parcours"
          value={intText(pathwayMix.total)}
          hint={`${pctText(pathwayMix.chronicPct)} chroniques · ${pctText(pathwayMix.episodicPct)} épisodiques`}
        />
        <StatCard
          label="Observations"
          value={intText(monitoring.observations)}
          hint="Mesures de monitoring (M4)"
        />
        <StatCard
          label="Triage critique"
          value={pctText(triage.criticalPct)}
          hint={`${intText(triage.byPriority.P1 ?? 0)} cas P1 sur ${intText(triage.total)}`}
          tone={triage.criticalPct >= 10 ? 'danger' : 'warning'}
        />
        <StatCard
          label="Alertes non acquittées"
          value={pctText(alerts.unacknowledgedPct)}
          hint={`${pctText(alerts.escalatedPct)} escaladées · ${intText(alerts.total)} au total`}
          tone={alerts.escalated > 0 ? 'danger' : 'warning'}
        />
        <StatCard
          label="Résultats anormaux"
          value={pctText(results.abnormalPct)}
          hint={`${intText(results.abnormal)} sur ${intText(results.total)} comptes rendus`}
          tone="warning"
        />
      </div>

      {/* Distribution charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Répartition des parcours"
            description="Chronique (CarePlan) vs épisodique (Encounter)."
          />
          <CardBody>
            <SegmentedBar segments={pathwaySegments} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Cycle de vie des alertes"
            description="Acquittement et escalade des DetectedIssue (§8)."
            action={
              <Badge tone="success">{pctText(alerts.acknowledgedPct)} acquittées</Badge>
            }
          />
          <CardBody>
            <SegmentedBar segments={alertSegments} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Distribution du triage (P1–P5)"
            description="Priorisation algorithmique des cas (M2)."
          />
          <CardBody>
            {triage.total === 0 ? (
              <EmptyState title="Aucun cas trié" />
            ) : (
              <BarChart data={triageBars} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Accès au DSP par rôle"
            description="Volume d’accès audités (AuditEvent, IHE ATNA)."
          />
          <CardBody>
            <BarChart data={roleBars} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Résultats de laboratoire & imagerie"
            description="Comptes rendus normaux vs anormaux (M5)."
          />
          <CardBody>
            {results.total === 0 ? (
              <EmptyState title="Aucun compte rendu" />
            ) : (
              <SegmentedBar segments={resultSegments} />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
