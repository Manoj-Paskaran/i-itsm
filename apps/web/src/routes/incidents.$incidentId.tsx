import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { IncidentWorkspace } from '@/components/incident/workspace';
export const Route = createFileRoute('/incidents/$incidentId')({ component: IncidentPage });
function IncidentPage() {
  const { incidentId } = Route.useParams();
  return (
    <AppShell>
      <IncidentWorkspace incidentId={incidentId} />
    </AppShell>
  );
}
