import type { IncidentSummary } from '@itsm/contracts';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, Inbox, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { AppShell, relativeAgo } from '@/components/app-shell';
import { PriorityChip, SlaPill, STATUS_ICON, STATUS_TEXT } from '@/components/incident/chips';
import { useAuth } from '@/lib/auth';
import { homeLabel } from '@/lib/report';
import {
  ESCALATION_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  statusGroup,
  useIncidents,
  useMyWorkload,
  useTechnicians,
} from '@/lib/incidents';
import {
  filterIncidents,
  queueSearch,
  sortIncidents,
  tabCounts,
  type Escalation,
  type QueueSort,
  type QueueTab,
} from '@/lib/queue';

export const Route = createFileRoute('/')({ component: Home });

const select =
  'h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground hover:bg-hover';

function Home() {
  const { user } = useAuth();
  const seesOthers = !!user?.permissions.includes('INCIDENT_ASSIGN');
  const isTechnician = user?.role === 'TECHNICIAN';
  const [tab, setTab] = useState<QueueTab>('open');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [escalation, setEscalation] = useState<Escalation | ''>('');
  const [sort, setSort] = useState<QueueSort>('newest');
  const search = queueSearch({ q: useDeferredValue(q), status, priority, assigneeId });
  const incidents = useIncidents(search);
  const technicians = useTechnicians(seesOthers);
  const all = incidents.data ?? [];
  // Counts follow every filter except the tab itself, so they always add up to what the tabs show.
  const counts = tabCounts(filterIncidents(all, 'all', escalation || null));
  const rows = sortIncidents(filterIncidents(all, tab, escalation || null), sort);
  const filtered = !!(q || status || priority || assigneeId || escalation);
  return (
    <AppShell>
      <header className="border-b border-border px-8 pt-5 pb-4 max-sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{homeLabel(user)}</h1>
          <Workload enabled={isTechnician} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="relative min-w-60 flex-1">
            <span className="sr-only">Search incidents</span>
            <Search
              size={14}
              className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, description or number"
              className="h-8 w-full rounded-md border border-input bg-background pr-3 pl-8 text-sm"
            />
          </label>
          <select
            aria-label="Status"
            className={select}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Status: any</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Priority"
            className={select}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">Priority: any</option>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {value} · {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Escalation level"
            className={select}
            value={escalation}
            onChange={(e) => setEscalation(e.target.value as Escalation | '')}
          >
            <option value="">Escalation: any</option>
            {Object.entries(ESCALATION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {seesOthers && (
            <select
              aria-label="Assignee"
              className={select}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Assignee: anyone</option>
              {technicians.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>
      <div className="px-8 py-5 max-sm:px-4">
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-panel px-4 py-2">
            <div
              role="tablist"
              aria-label="Incident state"
              className="flex items-center gap-4"
              title="Counts cover the incidents loaded on this page (up to 200)."
            >
              {(['open', 'closed', 'all'] as const).map((value) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={`text-sm tabular ${tab === value ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {{ open: 'Open', closed: 'Closed', all: 'All' }[value]}{' '}
                  <span className="text-xs">{counts[value]}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Sort
              <select
                className={`${select} h-7 text-xs`}
                value={sort}
                onChange={(e) => setSort(e.target.value as QueueSort)}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="priority">Priority</option>
                <option value="status">Status</option>
              </select>
            </label>
          </div>
          {incidents.isLoading ? (
            <ul aria-label="Loading incidents">
              {[1, 2, 3, 4, 5].map((n) => (
                <li key={n} className="space-y-2 border-b border-border px-4 py-3 last:border-0">
                  <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
                </li>
              ))}
            </ul>
          ) : incidents.isError ? (
            <div className="grid place-items-center gap-2 px-4 py-12 text-center">
              <p className="font-medium">Could not load incidents</p>
              <button className="text-sm text-primary" onClick={() => void incidents.refetch()}>
                Try again
              </button>
            </div>
          ) : rows.length ? (
            <ul
              aria-busy={incidents.isPlaceholderData}
              className={`transition-opacity ${incidents.isPlaceholderData ? 'opacity-50' : ''}`}
            >
              {rows.map((incident) => (
                <Row key={incident.id} incident={incident} />
              ))}
            </ul>
          ) : (
            <div className="grid place-items-center gap-2 px-4 py-12 text-center">
              <Inbox size={20} className="text-muted-foreground" aria-hidden />
              <p className="font-medium">
                {filtered
                  ? 'No incidents match these filters'
                  : `No ${tab === 'all' ? '' : tab + ' '}incidents`}
              </p>
              <p className="text-xs text-muted-foreground">
                {filtered
                  ? 'Clear a filter or try another search.'
                  : tab === 'open'
                    ? 'Nothing needs your attention right now.'
                    : tab === 'closed'
                      ? 'Closed incidents appear here once verified or closed.'
                      : 'No incidents yet.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Row({ incident }: { incident: IncidentSummary }) {
  const Icon = STATUS_ICON[incident.status];
  return (
    <li className="border-b border-border last:border-0 hover:bg-hover">
      <Link
        to="/incidents/$incidentId"
        params={{ incidentId: incident.id }}
        className="flex gap-3 px-4 py-2.5"
      >
        <Icon
          size={16}
          strokeWidth={2}
          className={`mt-0.5 shrink-0 ${STATUS_TEXT[statusGroup(incident.status)]}`}
          aria-label={STATUS_LABEL[incident.status]}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-semibold text-foreground">{incident.title}</span>
            <PriorityChip priority={incident.priority} />
            {incident.slaStatus === 'AT_RISK' || incident.slaStatus === 'BREACHED' ? (
              <SlaPill status={incident.slaStatus} />
            ) : null}
            {incident.escalationLevel !== 'TECHNICIAN' && (
              <span className="inline-flex h-6 items-center gap-1 rounded-md bg-high-subtle px-2 text-xs font-medium text-high-foreground">
                <ArrowUpRight size={13} aria-hidden />
                {ESCALATION_LABEL[incident.escalationLevel]}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground tabular">
            {incident.number} · {STATUS_LABEL[incident.status]} · {incident.service.name} · reported
            by {incident.reporter.name} {relativeAgo(incident.createdAt)} ·{' '}
            {incident.assignee ? `assigned to ${incident.assignee.name}` : 'unassigned'}
          </p>
        </div>
      </Link>
    </li>
  );
}

function Workload({ enabled }: { enabled: boolean }) {
  const me = useMyWorkload(enabled);
  if (!enabled || !me.data) return null;
  const { activeIncidents, capacity, availability } = me.data;
  const ratio = capacity ? Math.min(1, activeIncidents / capacity) : 0;
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
      aria-label="Your workload"
    >
      <span className="text-xs text-muted-foreground">Your workload</span>
      <span className="h-2 w-28 rounded-full bg-muted">
        <span
          className={`block h-2 rounded-full ${ratio >= 1 ? 'bg-fill-critical' : 'bg-primary'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span className="text-sm font-semibold tabular">
        {activeIncidents} / {capacity} open
      </span>
      <span className="text-xs text-muted-foreground">
        {availability.replace('_', ' ').toLowerCase()}
        {ratio >= 1 && ' · at capacity, no new auto-assignments'}
      </span>
    </div>
  );
}
