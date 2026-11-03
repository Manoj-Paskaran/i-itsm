import { createFileRoute } from '@tanstack/react-router';
import { HealthCard } from '@/components/health-card';

export const Route = createFileRoute('/')({ component: Home });
function Home() {
  return <HealthCard />;
}
