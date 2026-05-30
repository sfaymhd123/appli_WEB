import { useLocation } from 'react-router-dom';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { Badge } from '../../components/ui/badge';
import { NAV_ITEMS } from '../../lib/nav/nav-config';

/**
 * Placeholder for module sections not yet implemented (built in later phases
 * P5+). Derives its title/description from the nav catalogue so it stays in
 * sync with the side nav.
 */
export function ModulePlaceholderPage() {
  const { pathname } = useLocation();
  const item = NAV_ITEMS.find((i) => i.to === pathname);

  const title = item?.label ?? 'Module';
  const description = item?.description;

  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={item && <Badge tone="neutral">{item.module}</Badge>}
      />
      <CardBody>
        <EmptyState
          title="Module en construction"
          description="Cette section sera disponible dans une prochaine phase du prototype."
        />
      </CardBody>
    </Card>
  );
}
