import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Patient } from 'fhir/r4';
import type { RiskGroup, ZoneType } from '@hphii/fhir-domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SelectField,
  Spinner,
  Table,
  TextField,
  type Column,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { hasPatientFilter, usePatientSearch } from '../../lib/api/hooks/use-patients';
import type { PatientSearchFilters } from '../../lib/api/types/patient';
import {
  GENDER_LABELS,
  RISK_GROUP_OPTIONS,
  ZONE_OPTIONS,
  patientDisplayName,
  patientMrn,
  patientRiskGroup,
  patientCoverage,
  patientZone,
} from './patient-display';

export function PatientsListPage() {
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [zone, setZone] = useState('');
  const [riskGroup, setRiskGroup] = useState('');
  const [filters, setFilters] = useState<PatientSearchFilters>({});

  const query = usePatientSearch(filters);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({
      identifier: identifier.trim() || undefined,
      name: name.trim() || undefined,
      zone: (zone || undefined) as ZoneType | undefined,
      riskGroup: (riskGroup || undefined) as RiskGroup | undefined,
    });
  }

  const columns: Column<Patient>[] = [
    {
      key: 'mrn',
      header: 'Identifiant',
      render: (p) => <span className="font-mono text-xs">{patientMrn(p) ?? '—'}</span>,
    },
    {
      key: 'name',
      header: 'Nom',
      render: (p) => <span className="font-medium text-gray-900">{patientDisplayName(p)}</span>,
    },
    {
      key: 'gender',
      header: 'Sexe',
      render: (p) =>
        p.gender === 'male' || p.gender === 'female' ? GENDER_LABELS[p.gender] : (p.gender ?? '—'),
    },
    { key: 'birthYear', header: 'Naissance', render: (p) => p.birthDate ?? '—' },
    {
      key: 'zone',
      header: 'Zone',
      render: (p) => {
        const z = patientZone(p);
        return z ? <Badge tone="neutral">{z}</Badge> : '—';
      },
    },
    {
      key: 'scheme',
      header: 'Régime',
      render: (p) => {
        const s = patientCoverage(p);
        return s ? <Badge tone="neutral">{s}</Badge> : '—';
      },
    },
    {
      key: 'risk',
      header: 'Groupe de risque',
      render: (p) => {
        const r = patientRiskGroup(p);
        return r ? <Badge tone="clinical">{r}</Badge> : '—';
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <Link to={`/patients/${p.id}`} className="text-sm font-semibold text-clinical-700 hover:underline">
          Ouvrir
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
          <p className="mt-1 text-sm text-gray-600">Module M1 — Accueil & Identité.</p>
        </div>
        <Link to="/patients/new">
          <Button>Nouveau patient</Button>
        </Link>
      </div>

      <Card>
        <CardHeader title="Rechercher" description="Par identifiant, nom, zone ou groupe de risque." />
        <CardBody>
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={onSubmit}>
            <TextField
              name="identifier"
              label="Identifiant"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="off"
            />
            <TextField
              name="name"
              label="Nom"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
            <SelectField
              name="zone"
              label="Zone"
              placeholder="Toutes"
              options={ZONE_OPTIONS}
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            />
            <SelectField
              name="riskGroup"
              label="Groupe de risque"
              placeholder="Tous"
              options={RISK_GROUP_OPTIONS}
              value={riskGroup}
              onChange={(e) => setRiskGroup(e.target.value)}
            />
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" loading={query.isFetching && hasPatientFilter(filters)}>
                Rechercher
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {query.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" className="text-clinical-600" />
        </div>
      ) : query.isError ? (
        <EmptyState title="Recherche impossible" description={errorMessage(query.error)} />
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            {query.data?.total ?? 0} patient(s) trouvé(s).
          </p>
          <Table
            columns={columns}
            rows={query.data?.patients ?? []}
            rowKey={(p) => p.id ?? patientMrn(p) ?? Math.random().toString(36)}
            empty="Aucun patient ne correspond à ces critères."
          />
        </div>
      )}
    </div>
  );
}
