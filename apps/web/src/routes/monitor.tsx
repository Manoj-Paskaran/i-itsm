import { createFileRoute, Link } from '@tanstack/react-router';
import type { IncidentSummary, SlaRisk } from '@itsm/contracts';
import { ArrowUpRight } from 'lucide-react';
import { AppShell, relativeAgo } from '@/components/app-shell';
import { PriorityChip, RiskBadge, SlaPill } from '@/components/incident/chips';
import { useSlaRisks } from '@/lib/insights';
import { useSlaReport } from '@/lib/reports';
import { ESCALATION_LABEL, useIncidents } from '@/lib/incidents';
import { slaOnTrackPriority, slaWatchlist } from '@/lib/staff';
import { percent } from '@/lib/charts';

export const Route = createFileRoute('/monitor')({ component: Monitor });

const COLUMNS = [
  'Incident',
  'Priority',
  'SLA',
  'Predicted risk',
  'Escalated to',
  'Assignee',
  'Reported',
] as const;

function SlaPrediction({
  slaStatus,
  risk,
  loading,
}: {
  slaStatus: IncidentSummary['slaStatus'];
  risk?: SlaRisk;
  loading: boolean;
}) {
  if (slaStatus === 'BREACHED' || risk?.reasons.includes('resolution deadline already passed'))
    return <span className="text-xs text-muted-foreground">Overdue</span>;
  if (risk)
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <RiskBadge risk={risk} />
        <span className="rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground">
          Advisory
        </span>
      </span>
    );
  return (
    <span className="text-xs text-muted-foreground">{loading ? 'Loading…' : 'Unavailable'}</span>
  );
}

function EscalationValue({ level }: { level: IncidentSummary['escalationLevel'] }) {
  if (level === 'TECHNICIAN') return <span className="text-muted-foreground">Not escalated</span>;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-high-foreground">
      <ArrowUpRight size={14} className="shrink-0" aria-hidden />
      {ESCALATION_LABEL[level]}
    </span>
  );
}

function MonitorTable({
  label,
  rows,
  risks,
  risksLoading,
  loading = false,
  error = false,
  onRetry,
  emptyMessage,
  quietEmpty = false,
}: {
  label: string;
  rows: IncidentSummary[];
  risks?: Map<string, SlaRisk>;
  risksLoading: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  emptyMessage: string;
  quietEmpty?: boolean;
}) {
  if (quietEmpty) {
    if (loading) return <div className="h-12 animate-pulse rounded-lg bg-muted" />;
    if (error) return null;
    if (!rows.length) return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <>
      <ul
        className="divide-y divide-border rounded-lg border border-border lg:hidden"
        aria-label={label}
      >
        {loading ? (
          <li className="p-4" role="status">
            Loading incidents…
          </li>
        ) : error ? (
          <li className="p-4 text-critical-foreground" role="alert">
            Could not load incidents.{' '}
            {onRetry && (
              <button className="min-h-10 underline" onClick={onRetry}>
                Retry incidents
              </button>
            )}
          </li>
        ) : rows.length ? (
          rows.map((i) => (
            <li key={i.id} className="space-y-3 p-4">
              <Link
                to="/incidents/$incidentId"
                params={{ incidentId: i.id }}
                className="block min-h-10 font-semibold break-words hover:underline"
              >
                {i.title}
                <span className="block text-xs font-normal text-muted-foreground tabular">
                  {i.number} · {i.service.name}
                </span>
              </Link>
              <div className="flex flex-wrap gap-2">
                <PriorityChip priority={i.priority} />
                {i.slaStatus && <SlaPill status={i.slaStatus} />}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <SlaPrediction
                  slaStatus={i.slaStatus}
                  risk={risks?.get(i.id)}
                  loading={risksLoading}
                />
              </div>
              <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Escalated to</dt>
                <dd>
                  <EscalationValue level={i.escalationLevel} />
                </dd>
                <dt className="text-muted-foreground">Assignee</dt>
                <dd>{i.assignee?.name ?? 'Unassigned'}</dd>
                <dt className="text-muted-foreground">Reported</dt>
                <dd className="tabular">{relativeAgo(i.createdAt)}</dd>
              </dl>
            </li>
          ))
        ) : (
          <li className="p-6 text-center text-muted-foreground">{emptyMessage}</li>
        )}
      </ul>
      <div
        className="hidden overflow-x-auto rounded-lg border border-border focus-visible:outline-offset-2 lg:block"
        tabIndex={0}
        role="region"
        aria-label={label}
      >
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-panel text-left text-xs text-muted-foreground">
            <tr>
              {COLUMNS.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-2 py-2 font-medium whitespace-nowrap first:px-3"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-4">
                  <div className="h-6 animate-pulse rounded bg-muted" />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-critical-foreground">
                  Could not load incidents.{' '}
                  {onRetry && (
                    <button className="underline" onClick={onRetry}>
                      Retry incidents
                    </button>
                  )}
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((i) => (
                <tr key={i.id} className="border-t border-border hover:bg-hover">
                  <td className="w-[24%] min-w-[180px] px-3 py-3">
                    <Link
                      to="/incidents/$incidentId"
                      params={{ incidentId: i.id }}
                      className="font-semibold hover:underline"
                    >
                      {i.title}
                    </Link>
                    <div className="text-xs text-muted-foreground tabular">
                      {i.number} · {i.service.name}
                    </div>
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap">
                    <PriorityChip priority={i.priority} />
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap">
                    {i.slaStatus && <SlaPill status={i.slaStatus} />}
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap">
                    <SlaPrediction
                      slaStatus={i.slaStatus}
                      risk={risks?.get(i.id)}
                      loading={risksLoading}
                    />
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap">
                    <EscalationValue level={i.escalationLevel} />
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap">
                    {i.assignee?.name ?? 'Unassigned'}
                  </td>
                  <td className="px-2 py-3 text-xs whitespace-nowrap text-muted-foreground tabular">
                    {relativeAgo(i.createdAt)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Monitor() {
  const report = useSlaReport();
  const incidents = useIncidents('limit=200');
  const risks = useSlaRisks();
  const predictedHigh = new Set(
    [...(risks.data ?? [])].filter(([, r]) => r.level === 'HIGH').map(([id]) => id),
  );
  const rows = slaWatchlist(incidents.data ?? [], predictedHigh);
  const onTrackRows = slaOnTrackPriority(incidents.data ?? [], predictedHigh);
  const tiles: ReadonlyArray<{
    label: string;
    value: string | number | undefined;
    tone: string;
    sub?: string;
  }> = [
    {
      label: 'Breached, still open',
      value: report.data?.breachedOpen,
      tone: 'text-critical-foreground',
    },
    {
      label: 'At risk now',
      value: report.data?.atRiskNow,
      tone: 'text-warning-foreground',
    },
    {
      label: 'SLA compliance',
      value: percent(report.data?.compliance ?? null),
      tone: 'text-foreground',
    },
    {
      label: 'SLA targets met',
      value: report.data?.met,
      tone: 'text-foreground',
      sub:
        !report.isLoading && typeof report.data?.breached === 'number'
          ? `${report.data.breached} breached · all time`
          : undefined,
    },
  ];
  const attentionEmpty = risks.isLoading
    ? 'Checking advisory predictions…'
    : risks.isError
      ? 'No incidents match the available watchlist data.'
      : 'Every open incident is on track.';
  return (
    <AppShell>
      <header className="border-b border-border px-8 pt-5 pb-4 max-sm:px-4">
        <h1 className="text-xl font-semibold">SLA monitor</h1>
      </header>
      <div className="space-y-6 px-8 py-5 max-sm:px-4">
        {report.isError && (
          <p role="alert" className="text-sm text-critical-foreground">
            SLA totals could not load.{' '}
            <button className="min-h-10 underline sm:min-h-0" onClick={() => void report.refetch()}>
              Retry totals
            </button>
          </p>
        )}
        <dl className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
          {tiles.map((tile) => (
            <div key={tile.label} className="flex flex-col rounded-lg border border-border p-4">
              <dt className="text-xs text-muted-foreground">{tile.label}</dt>
              <dd className={`mt-1 text-2xl font-semibold tabular ${tile.tone}`}>
                {report.isLoading ? '…' : (tile.value ?? '—')}
              </dd>
              {tile.sub && (
                <dd className="mt-1 text-xs text-muted-foreground tabular">{tile.sub}</dd>
              )}
            </div>
          ))}
        </dl>
        {(risks.isLoading || risks.isError) && (
          <p role="status" className="text-xs text-muted-foreground">
            {risks.isLoading ? (
              'Loading advisory predictions…'
            ) : risks.isError ? (
              <>
                Predictions are unavailable; the watchlist only includes reported SLA statuses.{' '}
                <button
                  className="min-h-10 underline sm:min-h-0"
                  onClick={() => void risks.refetch()}
                >
                  Retry predictions
                </button>
              </>
            ) : null}
          </p>
        )}
        <section className="space-y-2.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">Needs attention</h2>
            {incidents.data && (
              <span className="text-xs text-muted-foreground tabular">{rows.length}</span>
            )}
          </div>
          <MonitorTable
            label="SLA watchlist"
            rows={rows}
            risks={risks.data}
            risksLoading={risks.isLoading}
            loading={incidents.isLoading}
            error={incidents.isError}
            onRetry={() => void incidents.refetch()}
            emptyMessage={attentionEmpty}
          />
        </section>
        <section className="space-y-2.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">Open P1 and P2 incidents on track</h2>
            {incidents.data && (
              <span className="text-xs text-muted-foreground tabular">{onTrackRows.length}</span>
            )}
          </div>
          <MonitorTable
            label="Open P1 and P2 incidents on track"
            rows={onTrackRows}
            risks={risks.data}
            risksLoading={risks.isLoading}
            loading={incidents.isLoading}
            error={incidents.isError}
            emptyMessage="No open P1 or P2 incidents on track."
            quietEmpty
          />
        </section>
      </div>
    </AppShell>
  );
}
