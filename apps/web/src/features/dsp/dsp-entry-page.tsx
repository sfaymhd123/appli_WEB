import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Patient } from 'fhir/r4';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Spinner,
  Table,
  TextField,
  type Column,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { hasPatientFilter, usePatientSearch } from '../../lib/api/hooks/use-patients';
import type { PatientSearchFilters } from '../../lib/api/types/patient';
import { useAuth } from '../../lib/auth/auth-context';
import { patientDisplayName, patientMrn, patientZone } from '../patients/patient-display';
import { roleLabel } from './dsp-display';

export function DspEntryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [filters, setFilters] = useState<PatientSearchFilters>({});
  const [directId, setDirectId] = useState('');

  const query = usePatientSearch(filters);

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({
      identifier: identifier.trim() || undefined,
      name: name.trim() || undefined,
    });
  }

  function onOpenDirect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = directId.trim();
    if (id) navigate(`/dsp/${encodeURIComponent(id)}`);
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
      key: 'zone',
      header: 'Zone',
      render: (p) => {
        const z = patientZone(p);
        return z ? <Badge tone="neutral">{z}</Badge> : '—';
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) =>
        p.id ? (
          <Link
            to={`/dsp/${p.id}`}
            className="text-sm font-semibold text-clinical-700 hover:underline"
          >
            Consulter le DSP
          </Link>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dossier de Santé Partagé (DSP)</h1>
        <p className="mt-1 text-sm text-gray-600">
          Module M6 — Consultation du dossier filtrée par rôle (RBAC §6). Vue active pour le rôle{' '}
          <span className="font-medium text-gray-700">{roleLabel(user?.role)}</span>.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Rechercher un patient"
          description="Par identifiant HPHII ou par nom, puis ouvrez son dossier partagé."
        />
        <CardBody>
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={onSearch}>
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
            <div className="flex items-end">
              <Button type="submit" loading={query.isFetching && hasPatientFilter(filters)}>
                Rechercher
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {!hasPatientFilter(filters) ? (
        <EmptyState
          title="Recherchez un patient"
          description="Saisissez un identifiant ou un nom, puis lancez la recherche pour ouvrir un dossier partagé."
        />
      ) : query.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" className="text-clinical-600" />
        </div>
      ) : query.isError ? (
        <EmptyState title="Recherche impossible" description={errorMessage(query.error)} />
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">{query.data?.total ?? 0} patient(s) trouvé(s).</p>
          <Table
            columns={columns}
            rows={query.data?.patients ?? []}
            rowKey={(p) => p.id ?? patientMrn(p) ?? Math.random().toString(36)}
            empty="Aucun patient ne correspond à ces critères."
          />
        </div>
      )}

      <Card>
        <CardHeader
          title="Ouvrir par identifiant FHIR"
          description="Si vous connaissez l’identifiant logique HAPI du patient, accédez directement à son DSP."
        />
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" onSubmit={onOpenDirect}>
            <div className="grow sm:max-w-xs">
              <TextField
                name="directId"
                label="Patient/{id}"
                placeholder="ex. 1234"
                value={directId}
                onChange={(e) => setDirectId(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={!directId.trim()}>
              Ouvrir le DSP
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
