import type { IncidentSummary } from '@itsm/contracts';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, Inbox, Plus, Search, SlidersHorizontal, UserX } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { AppShell, initials, relativeAgo } from '@/components/app-shell';
import {
  PriorityChip,
  SlaPill,
  StatusPill,
  STATUS_ICON,
  STATUS_TEXT,
} from '@/components/incident/chips';
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
  escalationChipStyle,
  filterIncidents,
  formatUnacknowledged,
  queueSearch,
  sortIncidents,
  tabCounts,
  type Escalation,
  type QueueSort,
  type QueueTab,
} from '@/lib/queue';
import { useNow } from '@/lib/use-now';

export const Route = createFileRoute('/')({ component: RoleHome });

const select =
  'h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground hover:bg-hover max-sm:min-h-10';

function RoleHome() {
  const { user } = useAuth();
  return user?.role === 'EMPLOYEE' ? <EmployeeHome /> : <Home />;
}

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
              className="h-8 w-full rounded-md border border-input bg-background pr-3 pl-8 text-sm max-sm:min-h-10"
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
              className="flex items-center gap-4 max-sm:gap-2"
              title="Counts cover the incidents loaded on this page (up to 200)."
            >
              {(['open', 'closed', 'all'] as const).map((value) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={`relative h-9 text-sm max-sm:min-h-10 ${tab === value ? 'font-semibold text-foreground after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:rounded-full after:bg-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {{ open: 'Open', closed: 'Closed', all: 'All' }[value]}
                  <span className="ml-1 rounded-full bg-muted px-1.5 text-2xs tabular">
                    {counts[value]}
                  </span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="max-sm:sr-only">Sort</span>
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
                <Row key={incident.id} incident={incident} seesOthers={seesOthers} />
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

function UnacknowledgedElapsed({ assignedAt }: { assignedAt: string }) {
  const now = useNow(1000);
  return (
    <span className="tabular"> · Not acknowledged · {formatUnacknowledged(assignedAt, now)}</span>
  );
}

function Row({ incident, seesOthers }: { incident: IncidentSummary; seesOthers: boolean }) {
  const Icon = STATUS_ICON[incident.status];
  const group = statusGroup(incident.status);
  const escalation = group !== 'done' ? escalationChipStyle(incident.escalationLevel) : null;
  return (
    <li className="border-b border-border last:border-0 hover:bg-hover">
      <Link
        to="/incidents/$incidentId"
        params={{ incidentId: incident.id }}
        className="flex items-start gap-3 px-4 py-2.5"
      >
        <Icon
          size={16}
          strokeWidth={2}
          className={`mt-0.5 shrink-0 ${STATUS_TEXT[group]}`}
          aria-label={STATUS_LABEL[incident.status]}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words text-base font-semibold text-foreground">
              {incident.title}
            </span>
            <PriorityChip priority={incident.priority} />
            {incident.slaStatus === 'AT_RISK' || incident.slaStatus === 'BREACHED' ? (
              <SlaPill status={incident.slaStatus} />
            ) : null}
            {escalation && (
              <span
                className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium ${escalation.className}`}
              >
                <ArrowUpRight size={13} aria-hidden />
                Escalated · {ESCALATION_LABEL[incident.escalationLevel]}
                <span className="ml-0.5 inline-flex items-center gap-0.5" aria-hidden>
                  {[1, 2, 3].map((step) => (
                    <span
                      key={step}
                      className={`size-1.5 rounded-full bg-current ${step <= escalation.level ? '' : 'opacity-25'}`}
                    />
                  ))}
                </span>
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground tabular">
            {incident.number} · {STATUS_LABEL[incident.status]} · {incident.service.name}
            {incident.status === 'ASSIGNED' && incident.assignedAt && (
              <UnacknowledgedElapsed assignedAt={incident.assignedAt} />
            )}{' '}
            · by {incident.reporter.name}
            <span className="sm:hidden"> · {relativeAgo(incident.createdAt)}</span>
          </p>
        </div>
        <div
          className={`ml-auto flex shrink-0 items-center gap-3 pt-0.5 text-xs text-muted-foreground tabular max-sm:flex-col max-sm:items-end max-sm:gap-1.5 ${seesOthers ? '' : 'max-sm:hidden'}`}
        >
          {seesOthers && (
            <span className="flex items-center gap-1.5 sm:w-28">
              {incident.assignee ? (
                <>
                  <span
                    aria-hidden
                    className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-2xs font-semibold text-foreground"
                    title={incident.assignee.name}
                  >
                    {initials(incident.assignee.name)}
                  </span>
                  <span
                    aria-hidden
                    className="min-w-0 truncate text-left text-xs text-foreground max-sm:hidden"
                  >
                    {incident.assignee.name.split(' ')[0]}
                  </span>
                  <span className="sr-only">Assigned to {incident.assignee.name}</span>
                </>
              ) : (
                <>
                  <span className="grid size-5 shrink-0 place-items-center" aria-hidden>
                    <UserX size={14} className="shrink-0 text-muted-foreground" />
                  </span>
                  <span aria-hidden className="min-w-0 truncate text-left max-sm:hidden">
                    Unassigned
                  </span>
                  <span className="sr-only">Unassigned</span>
                </>
              )}
            </span>
          )}
          <time
            dateTime={incident.createdAt}
            className="min-w-14 text-right whitespace-nowrap max-sm:hidden"
          >
            {relativeAgo(incident.createdAt)}
          </time>
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
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 max-sm:w-full"
      aria-label="Your workload"
    >
      <span className="text-xs whitespace-nowrap text-muted-foreground">Your workload</span>
      <span className="h-1.5 w-28 rounded-full bg-muted max-sm:flex-1">
        <span
          className={`block h-1.5 rounded-full ${ratio >= 1 ? 'bg-fill-critical' : 'bg-fill-done'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span className="text-sm font-semibold whitespace-nowrap tabular">
        {activeIncidents} / {capacity} open
      </span>
      <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
        <span
          className={`size-1.5 rounded-full ${availability === 'AVAILABLE' ? 'bg-success' : 'bg-neutral-dot'}`}
          aria-hidden
        />
        {availability
          .toLowerCase()
          .replaceAll('_', ' ')
          .replace(/^\w/, (c) => c.toUpperCase())}
      </span>
      {ratio >= 1 && (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          At capacity, no new auto-assignments
        </span>
      )}
    </div>
  );
}

/** Employee-owned view: keep staff queue changes independent of the phone reporting flow. */
function EmployeeHome() {
  const [tab, setTab] = useState<QueueTab>('open');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [escalation, setEscalation] = useState<Escalation | ''>('');
  const [sort, setSort] = useState<QueueSort>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const incidents = useIncidents(queueSearch({ q: useDeferredValue(q), status, priority }));
  const all = filterIncidents(incidents.data ?? [], 'all', escalation || null);
  const counts = tabCounts(all);
  const rows = sortIncidents(filterIncidents(all, tab, null), sort);
  const filterCount =
    [status, priority, escalation].filter(Boolean).length + Number(sort !== 'newest');
  const filtered = !!q.trim() || filterCount > 0;
  const control =
    'h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground hover:bg-hover';
  function clearFilters() {
    setQ('');
    setStatus('');
    setPriority('');
    setEscalation('');
    setSort('newest');
  }
  return (
    <AppShell>
      <header className="space-y-4 border-b border-border px-8 py-5 max-sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">My incidents</h1>
          </div>
          <Link
            to="/report"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary-hover max-sm:w-full"
          >
            <Plus size={16} aria-hidden />
            Report a problem
          </Link>
        </div>
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search my incidents</span>
            <Search
              size={16}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search your incidents"
              className="h-10 w-full rounded-md border border-input bg-background pr-3 pl-9 text-base placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="button"
            aria-expanded={showFilters}
            aria-controls="employee-filters"
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-hover aria-expanded:bg-muted aria-expanded:font-medium aria-expanded:ring-1 aria-expanded:ring-inset aria-expanded:ring-border-strong"
          >
            <SlidersHorizontal size={15} aria-hidden />
            Filters{' '}
            {filterCount > 0 && (
              <span className="rounded bg-muted px-1.5 text-xs tabular">{filterCount}</span>
            )}
          </button>
        </div>
        {showFilters && (
          <div id="employee-filters" className="grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1 text-xs font-medium">
              Status
              <select
                aria-label="Status"
                className={control}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Any status</option>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Priority
              <select
                aria-label="Priority"
                className={control}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="">Any priority</option>
                {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {value} · {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Escalation
              <select
                aria-label="Escalation"
                className={control}
                value={escalation}
                onChange={(e) => setEscalation(e.target.value as Escalation | '')}
              >
                <option value="">Any escalation level</option>
                {Object.entries(ESCALATION_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Sort
              <select
                aria-label="Sort incidents"
                className={control}
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
        )}
        {filtered && (
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-10 text-sm font-medium underline underline-offset-4 hover:text-muted-foreground"
          >
            Clear filters
          </button>
        )}
      </header>
      <div className="px-8 py-5 max-sm:px-4">
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center gap-1 border-b border-border bg-panel p-2">
            <div
              role="group"
              aria-label="Incident state"
              className="flex gap-1"
              title="Counts cover the incidents loaded on this page (up to 200)."
            >
              {(['open', 'closed', 'all'] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                  className={`h-10 rounded-md px-2.5 text-sm tabular sm:px-3 ${tab === value ? 'bg-muted font-medium text-foreground ring-1 ring-inset ring-border-strong' : 'text-muted-foreground hover:bg-hover hover:text-foreground'}`}
                >
                  {{ open: 'Open', closed: 'Closed', all: 'All' }[value]}{' '}
                  <span className="text-xs">
                    {incidents.isLoading || !incidents.data ? '—' : counts[value]}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {incidents.isError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"
            >
              <p className="text-sm text-critical-foreground">
                {incidents.data
                  ? 'Updates could not load. Showing the last loaded reports.'
                  : 'Your incidents could not load.'}
              </p>
              <button
                type="button"
                disabled={incidents.isFetching}
                onClick={() => void incidents.refetch()}
                className="min-h-10 rounded-md border border-border px-3 text-sm hover:bg-hover disabled:opacity-50"
              >
                {incidents.isFetching ? 'Retrying…' : 'Try again'}
              </button>
            </div>
          )}
          {incidents.isLoading ? (
            <ul aria-label="Loading your incidents" aria-busy="true">
              {[1, 2, 3].map((n) => (
                <li key={n} className="space-y-3 border-b border-border p-4 last:border-0">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </li>
              ))}
            </ul>
          ) : rows.length ? (
            <ul
              aria-busy={incidents.isFetching}
              className={incidents.isPlaceholderData ? 'opacity-50' : ''}
            >
              {rows.map((incident) => (
                <EmployeeRow key={incident.id} incident={incident} />
              ))}
            </ul>
          ) : (
            !incidents.isError && (
              <div role="status" className="grid place-items-center gap-2 px-4 py-12 text-center">
                <Inbox size={24} className="text-muted-foreground" aria-hidden />
                <p className="font-semibold">
                  {filtered
                    ? 'No incidents match these filters'
                    : tab === 'open'
                      ? 'No open incidents'
                      : tab === 'closed'
                        ? 'No closed incidents yet'
                        : 'No reports yet'}
                </p>
                <p className="max-w-prose text-sm text-muted-foreground">
                  {filtered
                    ? 'Try another search or clear your filters.'
                    : tab === 'open'
                      ? 'Your open reports will appear here. Need help? Report a problem above.'
                      : tab === 'closed'
                        ? 'Reports appear here once verified or closed.'
                        : 'Report a problem to get help from IT.'}
                </p>
                {filtered && (
                  <button
                    onClick={clearFilters}
                    className="min-h-10 px-3 text-sm font-medium underline underline-offset-4 hover:text-muted-foreground"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </AppShell>
  );
}

function EmployeeRow({ incident }: { incident: IncidentSummary }) {
  return (
    <li className="border-b border-border last:border-0">
      <Link
        to="/incidents/$incidentId"
        params={{ incidentId: incident.id }}
        className="block px-4 py-4 hover:bg-hover focus-visible:-outline-offset-2 max-sm:py-3.5"
      >
        <p className="text-base font-semibold break-words">{incident.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill status={incident.status} />
          <PriorityChip priority={incident.priority} />
          {(incident.slaStatus === 'AT_RISK' || incident.slaStatus === 'BREACHED') && (
            <SlaPill status={incident.slaStatus} />
          )}
          {incident.escalationLevel !== 'TECHNICIAN' && (
            <span className="inline-flex min-h-6 items-center gap-1 rounded-md bg-high-subtle px-2 text-xs font-medium text-high-foreground">
              <ArrowUpRight size={13} aria-hidden />
              Escalated to {ESCALATION_LABEL[incident.escalationLevel]}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground tabular break-words">
          {incident.number} · {incident.service.name} · Reported {relativeAgo(incident.createdAt)}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {incident.assignee ? (
            <>
              Assigned to{' '}
              <span className="font-medium text-foreground">{incident.assignee.name}</span>
            </>
          ) : (
            'Waiting for assignment'
          )}
        </p>
      </Link>
    </li>
  );
}
