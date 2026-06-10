import { CarePlanReviewStatus, PathwayType } from '@hphii/fhir-domain';
import type {
  ActivitySummary,
  CarePlanSummary,
  ConditionSummary,
  EpisodeSummary,
  PathwayResult,
} from './m3-parcours.types';

interface DemoProfile {
  kind: 'chronic' | 'episodic' | 'mixed';
  conditions: string[];
  activeCarePlan?: DemoCarePlan;
  activeEpisode?: DemoEpisode;
  previousCarePlans?: DemoCarePlan[];
  previousEpisodes?: DemoEpisode[];
}

type DemoCarePlan = Omit<CarePlanSummary, 'id' | 'created' | 'conditions'> & {
  conditionIndexes: number[];
};

type DemoEpisode = Omit<EpisodeSummary, 'id' | 'start' | 'end' | 'conditions'> & {
  conditionIndexes: number[];
};

const PROFILES: DemoProfile[] = [
  {
    kind: 'chronic',
    conditions: ['Hypertension arterielle', 'Diabete type 2'],
    activeCarePlan: {
      status: 'active',
      intent: 'plan',
      title: 'Suivi HTA et diabete',
      description: 'Parcours chronique avec surveillance tensionnelle et glycemique.',
      review: { needed: false },
      goals: ['TA < 140/90 mmHg', 'HbA1c cible < 7%', 'Education therapeutique mensuelle'],
      activities: [
        activity('Auto-mesure tensionnelle hebdomadaire', 'scheduled'),
        activity('Controle HbA1c trimestriel', 'in-progress'),
        activity('Revue du traitement antihypertenseur', 'scheduled'),
      ],
      careTeam: ['Dr. Alaoui - Medecin traitant', 'Infirmier referent', 'Pharmacien'],
      conditionIndexes: [0, 1],
    },
    previousEpisodes: [
      {
        status: 'finished',
        class: 'AMB',
        active: false,
        reason: 'Consultation de suivi diabete',
        conditionIndexes: [1],
      },
    ],
  },
  {
    kind: 'episodic',
    conditions: ['Infection respiratoire aigue', 'Fievre'],
    activeEpisode: {
      status: 'in-progress',
      class: 'AMB',
      active: true,
      reason: 'Toux febrile et dyspnee moderee',
      conditionIndexes: [0, 1],
    },
    previousEpisodes: [
      {
        status: 'finished',
        class: 'AMB',
        active: false,
        reason: 'Controle post-triage',
        conditionIndexes: [0],
      },
    ],
  },
  {
    kind: 'chronic',
    conditions: ['Insuffisance renale chronique', 'Hypertension arterielle'],
    activeCarePlan: {
      status: 'active',
      intent: 'plan',
      title: 'Parcours renal chronique',
      description: 'Suivi renal avec adaptation therapeutique et controle biologique.',
      review: {
        needed: true,
        status: CarePlanReviewStatus.NEEDED,
        reason: 'Creatinine elevee - revue du plan demandee',
        requestedAt: daysAgo(1),
      },
      goals: ['Stabiliser la fonction renale', 'Surveiller creatinine et kaliemie', 'Adapter les doses'],
      activities: [
        activity('Bilan renal mensuel', 'scheduled'),
        activity('Reconciliation medicamenteuse', 'in-progress'),
        activity('Education hydratation et regime sale', 'not-started'),
      ],
      careTeam: ['Nephrologue', 'Medecin traitant', 'Infirmier de coordination'],
      conditionIndexes: [0, 1],
    },
  },
  {
    kind: 'mixed',
    conditions: ['Diabete type 2', 'Plaie du pied diabetique', 'Suspicion infection locale'],
    activeCarePlan: {
      status: 'active',
      intent: 'plan',
      title: 'Parcours pied diabetique',
      description: 'Suivi chronique renforce avec episode aigu associe.',
      review: { needed: false },
      goals: ['Cicatrisation de la plaie', 'Controle glycemique', 'Prevenir complication infectieuse'],
      activities: [
        activity('Pansement deux fois par semaine', 'in-progress'),
        activity('Controle glycemique quotidien', 'scheduled'),
        activity('Evaluation podologique', 'scheduled'),
      ],
      careTeam: ['Medecin traitant', 'Infirmier pansement', 'Podologue'],
      conditionIndexes: [0, 1],
    },
    activeEpisode: {
      status: 'in-progress',
      class: 'EMER',
      active: true,
      reason: 'Douleur et rougeur autour de la plaie',
      conditionIndexes: [1, 2],
    },
  },
  {
    kind: 'episodic',
    conditions: ['Douleur thoracique', 'Suspicion syndrome coronarien'],
    activeEpisode: {
      status: 'in-progress',
      class: 'EMER',
      active: true,
      reason: 'Douleur thoracique aigue',
      conditionIndexes: [0, 1],
    },
    previousCarePlans: [
      {
        status: 'completed',
        intent: 'plan',
        title: 'Plan de prevention cardiovasculaire',
        description: 'Parcours clos apres stabilisation des facteurs de risque.',
        review: { needed: false },
        goals: ['Sevrage tabagique', 'Activite physique adaptee'],
        activities: [activity('Consultation cardiologie de controle', 'completed')],
        careTeam: ['Cardiologue', 'Medecin traitant'],
        conditionIndexes: [0],
      },
    ],
  },
];

export function withDemoPathway(result: PathwayResult): PathwayResult {
  if (result.activeCarePlan || result.activeEpisode) return result;

  const profile = PROFILES[hashString(result.patientId) % PROFILES.length];
  const conditions = profile.conditions.map((display, index) =>
    condition(result.patientId, index, display),
  );
  const activeCarePlan = profile.activeCarePlan
    ? carePlan(result.patientId, 'active', profile.activeCarePlan, conditions, 0)
    : undefined;
  const activeEpisode = profile.activeEpisode
    ? episode(result.patientId, 'active', profile.activeEpisode, conditions, 0)
    : undefined;
  const previousCarePlans = (profile.previousCarePlans ?? []).map((plan, index) =>
    carePlan(result.patientId, `previous-${index}`, plan, conditions, index + 1),
  );
  const previousEpisodes = (profile.previousEpisodes ?? []).map((ep, index) =>
    episode(result.patientId, `previous-${index}`, ep, conditions, index + 1),
  );

  const carePlans = [
    ...(activeCarePlan ? [activeCarePlan] : []),
    ...previousCarePlans,
    ...result.carePlans,
  ];
  const episodes = [
    ...(activeEpisode ? [activeEpisode] : []),
    ...previousEpisodes,
    ...result.episodes,
  ];
  const chronic = Boolean(activeCarePlan);
  const episodic = Boolean(activeEpisode);

  return {
    ...result,
    classification: chronic ? PathwayType.CHRONIC : episodic ? PathwayType.EPISODIC : PathwayType.NONE,
    chronic,
    episodic,
    activeCarePlan,
    carePlans,
    activeEpisode,
    episodes,
    conditions: [...conditions, ...result.conditions],
  };
}

function carePlan(
  patientId: string,
  suffix: string,
  plan: DemoCarePlan,
  conditions: ConditionSummary[],
  offset: number,
): CarePlanSummary {
  return {
    ...plan,
    id: `demo-cp-${patientId}-${suffix}`,
    created: daysAgo(30 + offset * 15),
    conditions: plan.conditionIndexes.map((index) => conditions[index]).filter(Boolean),
  };
}

function episode(
  patientId: string,
  suffix: string,
  ep: DemoEpisode,
  conditions: ConditionSummary[],
  offset: number,
): EpisodeSummary {
  const active = ep.active;
  return {
    ...ep,
    id: `demo-enc-${patientId}-${suffix}`,
    start: active ? daysAgo(1 + offset) : daysAgo(15 + offset * 8),
    end: active ? undefined : daysAgo(12 + offset * 8),
    conditions: ep.conditionIndexes.map((index) => conditions[index]).filter(Boolean),
  };
}

function condition(patientId: string, index: number, display: string): ConditionSummary {
  return {
    id: `demo-cond-${patientId}-${index}`,
    display,
    clinicalStatus: 'active',
    category: index === 0 ? 'problem-list-item' : 'encounter-diagnosis',
    recordedDate: daysAgo(45 - index * 6),
  };
}

function activity(description: string, status: string): ActivitySummary {
  return { description, status };
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
