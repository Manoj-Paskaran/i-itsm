import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHealth } from '@/lib/api';

function formatUptime(seconds: number) {
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return [
    days ? `${days}d` : '',
    hours ? `${hours}h` : '',
    minutes ? `${minutes}m` : '',
    `${total % 60}s`,
  ]
    .filter(Boolean)
    .join(' ');
}

export function HealthCard() {
  const { data, isError, isPending, dataUpdatedAt } = useHealth();
  const status = isError ? 'unreachable' : data?.status;
  const color =
    status === 'ok'
      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
      : status === 'degraded'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">SYSTEM OVERVIEW</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Service health</h1>
        <p className="mt-2 text-muted-foreground">A live view of your service connection.</p>
      </div>
      <Card className="max-w-xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>API status</CardTitle>
              <CardDescription className="mt-1">Updates every 10 seconds</CardDescription>
            </div>
            {isPending ? <Badge>Checking</Badge> : <Badge className={color}>{status}</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Version</dt>
              <dd className="mt-1 font-medium">{data?.version ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Uptime</dt>
              <dd className="mt-1 font-medium">{data ? formatUptime(data.uptimeSeconds) : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last checked</dt>
              <dd className="mt-1 font-medium">
                {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
