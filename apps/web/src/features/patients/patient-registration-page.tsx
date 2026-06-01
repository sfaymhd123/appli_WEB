import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Patient } from 'fhir/r4';
import type { CoverageScheme, RiskGroup, ZoneType } from '@hphii/fhir-domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  SelectField,
  TextField,
  useToast,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useAddCoverage, useRegisterPatient } from '../../lib/api/hooks/use-patients';
import type { CoverageResult } from '../../lib/api/types/patient';
import {
  COVERAGE_SCHEME_OPTIONS,
  GENDER_OPTIONS,
  RISK_GROUP_OPTIONS,
  ZONE_OPTIONS,
  patientMrn,
} from './patient-display';

interface RegistrationOutcome {
  patient: Patient;
  coverage: CoverageResult;
}

const CURRENT_YEAR = new Date().getFullYear();

export function PatientRegistrationPage() {
  const { toast } = useToast();
  const register = useRegisterPatient();
  const addCoverage = useAddCoverage();
  const [outcome, setOutcome] = useState<RegistrationOutcome | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [zoneType, setZoneType] = useState('');
  const [riskGroup, setRiskGroup] = useState('');
  const [phone, setPhone] = useState('');
  const [scheme, setScheme] = useState('');
  const [memberId, setMemberId] = useState('');

  const submitting = register.isPending || addCoverage.isPending;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const patient = await register.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender: gender as 'male' | 'female',
        birthYear: Number(birthYear),
        zoneType: zoneType as ZoneType,
        riskGroup: riskGroup as RiskGroup,
        phone: phone.trim() || undefined,
      });
      if (!patient.id) {
        throw new Error('Le serveur FHIR n’a pas renvoyé d’identifiant.');
      }
      const coverage = await addCoverage.mutateAsync({
        patientId: patient.id,
        body: { scheme: scheme as CoverageScheme, memberId: memberId.trim() || undefined },
      });
      setOutcome({ patient, coverage });
      toast('Patient enregistré avec succès.', 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  function resetForm() {
    setOutcome(null);
    setFirstName('');
    setLastName('');
    setGender('');
    setBirthYear('');
    setZoneType('');
    setRiskGroup('');
    setPhone('');
    setScheme('');
    setMemberId('');
  }

  if (outcome) {
    const { patient, coverage } = outcome;
    const eligible = coverage.eligibility.active;
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeading />
        <Card>
          <CardHeader
            title="Patient enregistré"
            description="Le dossier a été créé dans le référentiel FHIR."
          />
          <CardBody className="space-y-5">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="Identifiant FHIR (logique)" value={patient.id} mono />
              <Detail label="Identifiant patient HPHII" value={patientMrn(patient)} mono />
            </dl>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm font-medium text-gray-700">Éligibilité de la couverture</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={eligible ? 'success' : 'warning'}>
                  {eligible ? 'Active' : 'Inactive'}
                </Badge>
                <Badge tone="clinical">{coverage.eligibility.scheme}</Badge>
                <span className="text-xs text-gray-500">Vérification simulée (PoC)</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link to={`/patients/${patient.id}`}>
                <Button>Voir le dossier</Button>
              </Link>
              <Button variant="secondary" onClick={resetForm}>
                Enregistrer un autre patient
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeading />
      <Card>
        <CardHeader
          title="Identité du patient"
          description="Module M1 — Accueil & Identité (ARCH.md §2)."
        />
        <CardBody>
          <form className="space-y-5" onSubmit={onSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="firstName"
                label="Prénom"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="off"
              />
              <TextField
                name="lastName"
                label="Nom"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="off"
              />
              <SelectField
                name="gender"
                label="Sexe"
                required
                placeholder="Sélectionner…"
                options={GENDER_OPTIONS}
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              />
              <TextField
                name="birthYear"
                label="Année de naissance"
                type="number"
                inputMode="numeric"
                min={1900}
                max={CURRENT_YEAR}
                required
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
              />
              <SelectField
                name="zoneType"
                label="Zone de résidence"
                required
                placeholder="Sélectionner…"
                options={ZONE_OPTIONS}
                value={zoneType}
                onChange={(e) => setZoneType(e.target.value)}
              />
              <SelectField
                name="riskGroup"
                label="Groupe de risque"
                required
                placeholder="Sélectionner…"
                options={RISK_GROUP_OPTIONS}
                value={riskGroup}
                onChange={(e) => setRiskGroup(e.target.value)}
              />
              <TextField
                name="phone"
                label="Téléphone mobile"
                type="tel"
                hint="Optionnel — canal SMS."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-gray-900">Couverture</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <SelectField
                  name="scheme"
                  label="Régime"
                  required
                  placeholder="Sélectionner…"
                  options={COVERAGE_SCHEME_OPTIONS}
                  value={scheme}
                  onChange={(e) => setScheme(e.target.value)}
                />
                <TextField
                  name="memberId"
                  label="N° d’assuré"
                  hint="Optionnel."
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={submitting}>
                Enregistrer le patient
              </Button>
              <Link to="/patients">
                <Button variant="ghost" type="button">
                  Annuler
                </Button>
              </Link>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

function PageHeading() {
  return (
    <div>
      <Link to="/patients" className="text-sm text-clinical-700 hover:underline">
        ← Patients
      </Link>
      <h1 className="mt-1 text-2xl font-bold text-gray-900">Nouveau patient</h1>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={mono ? 'mt-0.5 font-mono text-sm text-gray-900' : 'mt-0.5 text-sm text-gray-900'}>
        {value ?? '—'}
      </dd>
    </div>
  );
}
