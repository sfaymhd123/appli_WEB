import { Role } from '@hphii/fhir-domain';
import { EmptyState } from '../../components/ui';
import { useAuth } from '../../lib/auth/auth-context';
import { LabWorklistPanel } from './lab-worklist-panel';
import { PharmacistQueuePanel } from './pharmacist-queue-panel';
import { PhysicianServicesPanel } from './physician-services-panel';

/**
 * M5 — Services médico-techniques. A single route whose content adapts to the
 * signed-in role (§6): the physician orders meds/studies and sees results, the
 * pharmacist works the prescription validation queue, the lab technician fills
 * the worklist with results. The route is already gated to these three roles.
 */
export function ServicesPage() {
  const { user } = useAuth();

  switch (user?.role) {
    case Role.PHYSICIAN:
      return <PhysicianServicesPanel />;
    case Role.PHARMACIST:
      return <PharmacistQueuePanel />;
    case Role.LAB_TECHNICIAN:
      return <LabWorklistPanel />;
    default:
      return (
        <EmptyState
          title="Module non disponible pour ce rôle"
          description="Les services médico-techniques sont accessibles aux médecins, pharmaciens et laborantins."
        />
      );
  }
}
