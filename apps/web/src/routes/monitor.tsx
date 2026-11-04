import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { AppShell, relativeAgo } from '@/components/app-shell';
import { PriorityChip, SlaPill } from '@/components/incident/chips';
import { useSlaReport } from '@/lib/reports';
import { ESCALATION_LABEL, useIncidents } from '@/lib/incidents';
import { slaWatchlist } from '@/lib/staff';

export const Route = createFileRoute('/monitor')({ component: Monitor });

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

function Monitor() {
  const report = useSlaReport();
  const incidents = useIncidents('limit=200');
  const rows = slaWatchlist(incidents.data ?? []);
  const tiles = [
    ['Breached, still open', report.data?.breachedOpen, 'text-critical-foreground'],
    ['At risk now', report.data?.atRiskNow, 'text-warning-foreground'],
    ['SLA compliance', percent(report.data?.compliance ?? null), 'text-foreground'],
    [
      'Met / breached (all time)',
      report.data ? `${report.data.met} / ${report.data.breached}` : undefined,
      'text-foreground',
    ],
  ] as const;
  return (
    <AppShell>
      <header className="border-b border-border px-8 pt-5 pb-4 max-sm:px-4">
        <h1 className="text-xl font-semibold">SLA monitor</h1>
        <p className="text-sm text-muted-foreground">
          Breached and at-risk incidents with their escalation level. Refreshes live.
        </p>
      </header>
      <div className="space-y-6 px-8 py-5 max-sm:px-4">
        <dl className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
          {tiles.map(([label, value, tone]) => (
            <div key={label} className="rounded-lg border border-border p-4">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={`mt-1 text-2xl font-semibold tabular ${tone}`}>
                {report.isLoading ? '…' : (value ?? '—')}
              </dd>
            </div>
          ))}
        </dl>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-panel text-left text-xs text-muted-foreground">
              <tr>
                {['Incident', 'Priority', 'SLA', 'Escalated to', 'Assignee', 'Reported'].map(
                  (h) => (
                    <th key={h} className="px-4 py-2 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {incidents.isLoading ? (
                <tr>
                  <td colSpan={6} className="p-4">
                    <div className="h-6 animate-pulse rounded bg-muted" />
                  </td>
                </tr>
              ) : incidents.isError ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-critical-foreground">
                    Could not load incidents.
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((i) => (
                  <tr key={i.id} className="border-t border-border hover:bg-hover">
                    <td className="px-4 py-2.5">
                      <Link
                        to="/incidents/$incidentId"
                        params={{ incidentId: i.id }}
                        className="font-semibold"
                      >
                        {i.title}
                      </Link>
                      <div className="text-xs text-muted-foreground tabular">
                        {i.number} · {i.service.name}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <PriorityChip priority={i.priority} />
                    </td>
                    <td className="px-4 py-2.5">
                      {i.slaStatus && <SlaPill status={i.slaStatus} />}
                    </td>
                    <td className="px-4 py-2.5">
                      {i.escalationLevel === 'TECHNICIAN' ? (
                        <span className="text-muted-foreground">Not escalated</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-high-foreground">
                          <ArrowUpRight size={14} aria-hidden />
                          {ESCALATION_LABEL[i.escalationLevel]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{i.assignee?.name ?? 'Unassigned'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular">
                      {relativeAgo(i.createdAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    Every open incident is on track.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
