import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Role } from '@hphii/fhir-domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Modal,
  SelectField,
  Spinner,
  TextField,
  useToast,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import {
  useAcknowledgeReview,
  useCloseCarePlan,
  useCloseEpisode,
  useCreateCarePlan,
  useCreateEpisode,
  useSwitchToChronic,
  useUpdateCarePlan,
  usePathway,
} from '../../lib/api/hooks/use-pathway';
import { usePatient } from '../../lib/api/hooks/use-patients';
import type {
  CarePlanReviewInfo,
  CarePlanSummary,
  EpisodeSummary,
} from '../../lib/api/types/pathway';
import { useAuth } from '../../lib/auth/auth-context';
import { patientDisplayName } from '../patients/patient-display';
import {
  activityStatusLabel,
  activityStatusTone,
  carePlanStatusLabel,
  carePlanStatusTone,
  classificationTone,
  encounterStatusLabel,
  encounterStatusTone,
  parseList,
  pathwayLabel,
  shortDate,
  shortDateTime,
  CARE_PLAN_STATUS_OPTIONS,
} from './pathway-display';

type ActiveModal =
  | { kind: 'create-careplan' }
  | { kind: 'update-careplan'; plan: CarePlanSummary }
  | { kind: 'close-careplan'; plan: CarePlanSummary }
  | { kind: 'create-episode' }
  | { kind: 'close-episode'; episode: EpisodeSummary }
  | { kind: 'switch'; episode: EpisodeSummary }
  | null;

export function PathwayPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const isPhysician = user?.role === Role.PHYSICIAN;

  const pathway = usePathway(patientId);
  const patient = usePatient(patientId);
  const acknowledge = useAcknowledgeReview();

  const [modal, setModal] = useState<ActiveModal>(null);

  if (!patientId) {
    return <EmptyState title="Patient non spécifié" description="Aucun identifiant de patient." />;
  }

  async function onAcknowledge(carePlanId: string) {
    try {
      await acknowledge.mutateAsync(carePlanId);
      toast('Révision du plan acquittée.', 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  const data = pathway.data;
  const patientName = patient.data ? patientDisplayName(patient.data) : undefined;
  const activeCarePlan = data?.activeCarePlan;
  const activeEpisode = data?.activeEpisode;
  const pastCarePlans = (data?.carePlans ?? []).filter((cp) => cp.id !== activeCarePlan?.id);
  const pastEpisodes = (data?.episodes ?? []).filter((e) => e.id !== activeEpisode?.id);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/care-plans" className="text-sm text-clinical-700 hover:underline">
          ← Parcours de soins
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Parcours de soins (M3)</h1>
        <p className="mt-1 text-sm text-gray-600">
          Modules M3a / M3b — <span className="font-mono">Patient/{patientId}</span>
          {patientName && <> · {patientName}</>}
        </p>
      </div>

      {pathway.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" className="text-clinical-600" />
        </div>
      ) : pathway.isError ? (
        <EmptyState title="Parcours indisponible" description={errorMessage(pathway.error)} />
      ) : data ? (
        <>
          {/* Classification banner — the chronic/episodic bifurcation at a glance */}
          <Card>
            <CardBody className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Orientation
              </span>
              <Badge tone={classificationTone(data.classification)}>
                {pathwayLabel(data.classification)}
              </Badge>
              <span className="text-gray-300">|</span>
              <Badge tone={data.chronic ? 'clinical' : 'neutral'}>
                {data.chronic ? 'Plan chronique actif' : 'Aucun plan actif'}
              </Badge>
              <Badge tone={data.episodic ? 'warning' : 'neutral'}>
                {data.episodic ? 'Épisode actif' : 'Aucun épisode actif'}
              </Badge>
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ---------- Chronic side (M3a) ---------- */}
            <Card>
              <CardHeader
                title="Parcours chronique (M3a)"
                description="CarePlan : objectifs, activités, équipe de soins et conditions suivies."
                action={
                  <Button size="sm" onClick={() => setModal({ kind: 'create-careplan' })}>
                    Ouvrir un plan
                  </Button>
                }
              />
              <CardBody className="space-y-4">
                {activeCarePlan ? (
                  <>
                    {activeCarePlan.review.needed && (
                      <ReviewBanner
                        review={activeCarePlan.review}
                        pending={acknowledge.isPending}
                        onAcknowledge={() => onAcknowledge(activeCarePlan.id)}
                      />
                    )}

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">
                          {activeCarePlan.title ?? 'Plan de soins'}
                        </p>
                        {activeCarePlan.description && (
                          <p className="text-sm text-gray-600">{activeCarePlan.description}</p>
                        )}
                        <p className="mt-1 font-mono text-xs text-gray-400">
                          CarePlan/{activeCarePlan.id}
                        </p>
                      </div>
                      <Badge tone={carePlanStatusTone(activeCarePlan.status)}>
                        {carePlanStatusLabel(activeCarePlan.status)}
                      </Badge>
                    </div>

                    <Section title="Objectifs">
                      {activeCarePlan.goals.length ? (
                        <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
                          {activeCarePlan.goals.map((goal, i) => (
                            <li key={i}>{goal}</li>
                          ))}
                        </ul>
                      ) : (
                        <Muted>Aucun objectif.</Muted>
                      )}
                    </Section>

                    <Section title="Activités">
                      {activeCarePlan.activities.length ? (
                        <ul className="space-y-1.5">
                          {activeCarePlan.activities.map((act, i) => (
                            <li key={i} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-gray-700">{act.description}</span>
                              <Badge tone={activityStatusTone(act.status)}>
                                {activityStatusLabel(act.status)}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <Muted>Aucune activité.</Muted>
                      )}
                    </Section>

                    <Section title="Équipe de soins">
                      {activeCarePlan.careTeam.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {activeCarePlan.careTeam.map((member, i) => (
                            <Badge key={i} tone="neutral">
                              {member}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <Muted>Aucun membre.</Muted>
                      )}
                    </Section>

                    <Section title="Conditions suivies">
                      {activeCarePlan.conditions.length ? (
                        <ul className="space-y-1 text-sm text-gray-700">
                          {activeCarePlan.conditions.map((c) => (
                            <li key={c.id}>{c.display ?? c.code ?? `Condition/${c.id}`}</li>
                          ))}
                        </ul>
                      ) : (
                        <Muted>Aucune condition liée.</Muted>
                      )}
                    </Section>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setModal({ kind: 'update-careplan', plan: activeCarePlan })}
                      >
                        Ajuster
                      </Button>
                      {isPhysician && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setModal({ kind: 'close-careplan', plan: activeCarePlan })}
                        >
                          Clôturer
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title="Aucun plan chronique actif"
                    description="Ouvrez un plan de soins pour démarrer un suivi longitudinal."
                  />
                )}

                {pastCarePlans.length > 0 && (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Plans précédents
                    </p>
                    <ul className="mt-2 space-y-1">
                      {pastCarePlans.map((cp) => (
                        <li key={cp.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate text-gray-700">
                            {cp.title ?? `CarePlan/${cp.id}`}
                          </span>
                          <Badge tone={carePlanStatusTone(cp.status)}>
                            {carePlanStatusLabel(cp.status)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* ---------- Episodic side (M3b) ---------- */}
            <Card>
              <CardHeader
                title="Parcours épisodique (M3b)"
                description="Encounter + Condition : épisode aigu, ouvert puis clôturé."
                action={
                  <Button size="sm" onClick={() => setModal({ kind: 'create-episode' })}>
                    Ouvrir un épisode
                  </Button>
                }
              />
              <CardBody className="space-y-4">
                {activeEpisode ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">
                          {activeEpisode.reason ?? 'Épisode aigu'}
                        </p>
                        <p className="text-sm text-gray-600">
                          {activeEpisode.class ? `Classe ${activeEpisode.class} · ` : ''}
                          Début {shortDateTime(activeEpisode.start)}
                        </p>
                        <p className="mt-1 font-mono text-xs text-gray-400">
                          Encounter/{activeEpisode.id}
                        </p>
                      </div>
                      <Badge tone={encounterStatusTone(activeEpisode.status)}>
                        {encounterStatusLabel(activeEpisode.status)}
                      </Badge>
                    </div>

                    <Section title="Conditions">
                      {activeEpisode.conditions.length ? (
                        <ul className="space-y-1 text-sm text-gray-700">
                          {activeEpisode.conditions.map((c) => (
                            <li key={c.id}>{c.display ?? c.code ?? `Condition/${c.id}`}</li>
                          ))}
                        </ul>
                      ) : (
                        <Muted>Aucune condition liée.</Muted>
                      )}
                    </Section>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setModal({ kind: 'close-episode', episode: activeEpisode })}
                      >
                        Clôturer
                      </Button>
                      {isPhysician && (
                        <Button
                          size="sm"
                          onClick={() => setModal({ kind: 'switch', episode: activeEpisode })}
                        >
                          Basculer en chronique
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title="Aucun épisode actif"
                    description="Ouvrez un épisode pour une prise en charge ponctuelle."
                  />
                )}

                {pastEpisodes.length > 0 && (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Épisodes précédents
                    </p>
                    <ul className="mt-2 space-y-1">
                      {pastEpisodes.map((ep) => (
                        <li key={ep.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate text-gray-700">
                            {ep.reason ?? `Encounter/${ep.id}`}
                            <span className="ml-1 text-gray-400">{shortDate(ep.end ?? ep.start)}</span>
                          </span>
                          <Badge tone={encounterStatusTone(ep.status)}>
                            {encounterStatusLabel(ep.status)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Conditions overview (all sources) */}
          <Card>
            <CardHeader
              title="Conditions du patient"
              description="Problèmes et diagnostics enregistrés, toutes sources confondues."
              action={<Badge tone="neutral">{data.conditions.length}</Badge>}
            />
            <CardBody>
              {data.conditions.length ? (
                <ul className="divide-y divide-gray-100">
                  {data.conditions.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-900">
                          {c.display ?? c.code ?? `Condition/${c.id}`}
                        </p>
                        <p className="font-mono text-xs text-gray-400">
                          Condition/{c.id}
                          {c.category ? ` · ${c.category}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {c.clinicalStatus && <Badge tone="neutral">{c.clinicalStatus}</Badge>}
                        <p className="mt-1 text-xs text-gray-500">{shortDate(c.recordedDate)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Aucune condition enregistrée.</p>
              )}
            </CardBody>
          </Card>
        </>
      ) : null}

      {/* ---------- Modals ---------- */}
      {modal?.kind === 'create-careplan' && (
        <CreateCarePlanForm patientId={patientId} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'update-careplan' && (
        <UpdateCarePlanForm plan={modal.plan} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'close-careplan' && (
        <ClosePlanForm plan={modal.plan} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'create-episode' && (
        <CreateEpisodeForm patientId={patientId} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'close-episode' && (
        <CloseEpisodeForm episode={modal.episode} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'switch' && (
        <SwitchToChronicForm episode={modal.episode} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

/* ---------- presentational helpers ---------- */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gray-400">{children}</p>;
}

function ReviewBanner({
  review,
  pending,
  onAcknowledge,
}: {
  review: CarePlanReviewInfo;
  pending: boolean;
  onAcknowledge: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">Révision requise</p>
          <p className="text-sm text-amber-700">
            {review.reason ?? 'Le monitoring (M4) a signalé ce plan pour révision.'}
          </p>
          {review.requestedAt && (
            <p className="mt-0.5 text-xs text-amber-600">
              Demandée le {shortDateTime(review.requestedAt)}
            </p>
          )}
        </div>
        <Button size="sm" variant="secondary" loading={pending} onClick={onAcknowledge}>
          Acquitter
        </Button>
      </div>
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-clinical-700 focus:ring-clinical-600"
      />
      {label}
    </label>
  );
}

const LIST_HINT = 'Séparez les éléments par des virgules.';

/* ---------- chronic forms ---------- */

function CreateCarePlanForm({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateCarePlan();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [conditions, setConditions] = useState('');
  const [goals, setGoals] = useState('');
  const [activities, setActivities] = useState('');
  const [careTeam, setCareTeam] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await create.mutateAsync({
        patientId,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        conditions: parseList(conditions).map((display) => ({ display })),
        goals: parseList(goals),
        activities: parseList(activities).map((description) => ({ description })),
        careTeam: parseList(careTeam).map((name) => ({ name })),
      });
      toast(`Plan de soins ouvert : CarePlan/${result.summary.id}.`, 'success');
      onClose();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Ouvrir un plan de soins (chronique)"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="m3-create-careplan" loading={create.isPending}>
            Ouvrir le plan
          </Button>
        </>
      }
    >
      <form id="m3-create-careplan" className="space-y-4" onSubmit={onSubmit}>
        <TextField name="title" label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField
          name="description"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextField
          name="conditions"
          label="Conditions suivies"
          hint={LIST_HINT}
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
        />
        <TextField
          name="goals"
          label="Objectifs"
          hint={LIST_HINT}
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
        />
        <TextField
          name="activities"
          label="Activités"
          hint={LIST_HINT}
          value={activities}
          onChange={(e) => setActivities(e.target.value)}
        />
        <TextField
          name="careTeam"
          label="Équipe de soins"
          hint={LIST_HINT}
          value={careTeam}
          onChange={(e) => setCareTeam(e.target.value)}
        />
      </form>
    </Modal>
  );
}

function UpdateCarePlanForm({ plan, onClose }: { plan: CarePlanSummary; onClose: () => void }) {
  const { toast } = useToast();
  const update = useUpdateCarePlan();
  const [title, setTitle] = useState(plan.title ?? '');
  const [description, setDescription] = useState(plan.description ?? '');
  const [status, setStatus] = useState(plan.status);
  const [activities, setActivities] = useState(
    plan.activities.map((a) => a.description).join(', '),
  );
  const [addGoals, setAddGoals] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const acts = parseList(activities).map((description) => ({ description }));
    try {
      await update.mutateAsync({
        carePlanId: plan.id,
        body: {
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          status,
          activities: acts.length ? acts : undefined,
          addGoals: parseList(addGoals),
        },
      });
      toast('Plan de soins ajusté.', 'success');
      onClose();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Ajuster le plan de soins"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="m3-update-careplan" loading={update.isPending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="m3-update-careplan" className="space-y-4" onSubmit={onSubmit}>
        <TextField name="title" label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField
          name="description"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <SelectField
          name="status"
          label="Statut"
          options={CARE_PLAN_STATUS_OPTIONS}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        />
        <TextField
          name="activities"
          label="Activités"
          hint={`${LIST_HINT} Remplace les activités existantes.`}
          value={activities}
          onChange={(e) => setActivities(e.target.value)}
        />
        <TextField
          name="addGoals"
          label="Nouveaux objectifs"
          hint={`${LIST_HINT} Ajoutés aux objectifs existants.`}
          value={addGoals}
          onChange={(e) => setAddGoals(e.target.value)}
        />
      </form>
    </Modal>
  );
}

function ClosePlanForm({ plan, onClose }: { plan: CarePlanSummary; onClose: () => void }) {
  const { toast } = useToast();
  const close = useCloseCarePlan();
  const [reason, setReason] = useState('');
  const [cancelled, setCancelled] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await close.mutateAsync({
        carePlanId: plan.id,
        body: { reason: reason.trim() || undefined, cancelled },
      });
      toast(cancelled ? 'Plan annulé.' : 'Plan clôturé.', 'success');
      onClose();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Clôturer le plan de soins"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="m3-close-careplan" variant="danger" loading={close.isPending}>
            {cancelled ? 'Annuler le plan' : 'Clôturer'}
          </Button>
        </>
      }
    >
      <form id="m3-close-careplan" className="space-y-4" onSubmit={onSubmit}>
        <TextField
          name="reason"
          label="Motif"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <CheckboxField
          label="Annuler le plan (saisi par erreur) plutôt que le clôturer"
          checked={cancelled}
          onChange={setCancelled}
        />
      </form>
    </Modal>
  );
}

/* ---------- episodic forms ---------- */

function CreateEpisodeForm({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateEpisode();
  const [complaint, setComplaint] = useState('');
  const [conditions, setConditions] = useState('');
  const [emergency, setEmergency] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await create.mutateAsync({
        patientId,
        complaint: complaint.trim() || undefined,
        conditions: parseList(conditions).map((display) => ({ display })),
        emergency,
      });
      toast(`Épisode ouvert : Encounter/${result.summary.id}.`, 'success');
      onClose();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Ouvrir un épisode (épisodique)"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="m3-create-episode" loading={create.isPending}>
            Ouvrir l’épisode
          </Button>
        </>
      }
    >
      <form id="m3-create-episode" className="space-y-4" onSubmit={onSubmit}>
        <TextField
          name="complaint"
          label="Motif de consultation"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
        />
        <TextField
          name="conditions"
          label="Conditions / diagnostics"
          hint={LIST_HINT}
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
        />
        <CheckboxField label="Épisode d’urgence" checked={emergency} onChange={setEmergency} />
      </form>
    </Modal>
  );
}

function CloseEpisodeForm({ episode, onClose }: { episode: EpisodeSummary; onClose: () => void }) {
  const { toast } = useToast();
  const close = useCloseEpisode();
  const [reason, setReason] = useState('');
  const [cancelled, setCancelled] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await close.mutateAsync({
        episodeId: episode.id,
        body: { reason: reason.trim() || undefined, cancelled },
      });
      toast(cancelled ? 'Épisode annulé.' : 'Épisode clôturé.', 'success');
      onClose();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Clôturer l’épisode"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="m3-close-episode" variant="danger" loading={close.isPending}>
            {cancelled ? 'Annuler l’épisode' : 'Clôturer'}
          </Button>
        </>
      }
    >
      <form id="m3-close-episode" className="space-y-4" onSubmit={onSubmit}>
        <TextField
          name="reason"
          label="Motif"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <CheckboxField
          label="Annuler l’épisode (saisi par erreur) plutôt que le clôturer"
          checked={cancelled}
          onChange={setCancelled}
        />
      </form>
    </Modal>
  );
}

function SwitchToChronicForm({ episode, onClose }: { episode: EpisodeSummary; onClose: () => void }) {
  const { toast } = useToast();
  const switchToChronic = useSwitchToChronic();
  const [title, setTitle] = useState('');
  const [goals, setGoals] = useState('');
  const [closeEpisode, setCloseEpisode] = useState(true);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const carePlan = await switchToChronic.mutateAsync({
        episodeId: episode.id,
        body: { title: title.trim() || undefined, goals: parseList(goals), closeEpisode },
      });
      toast(`Épisode basculé en chronique : CarePlan/${carePlan.id ?? '—'}.`, 'success');
      onClose();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Basculer l’épisode en parcours chronique"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="m3-switch" loading={switchToChronic.isPending}>
            Basculer en chronique
          </Button>
        </>
      }
    >
      <form id="m3-switch" className="space-y-4" onSubmit={onSubmit}>
        <p className="text-sm text-gray-600">
          Un plan de soins chronique sera ouvert à partir de cet épisode, reprenant ses conditions.
        </p>
        <TextField name="title" label="Titre du plan" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField
          name="goals"
          label="Objectifs"
          hint={LIST_HINT}
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
        />
        <CheckboxField
          label="Clôturer l’épisode après la bascule"
          checked={closeEpisode}
          onChange={setCloseEpisode}
        />
      </form>
    </Modal>
  );
}
