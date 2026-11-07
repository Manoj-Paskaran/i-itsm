import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import { IncidentDetailSchema } from '@itsm/contracts';
import {
  AlarmClock,
  AlarmClockOff,
  ArrowUpRight,
  ArrowRightLeft,
  Bot,
  ChevronDown,
  History,
  MessageSquare,
  Search,
  Settings,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { AppShell, initials } from '@/components/app-shell';
import { auditActionLabel, auditSearch, labelIds, useAudit } from '@/lib/admin';
import {
  AUDIT_CATEGORIES,
  auditCategory,
  auditDateRange,
  auditTimeBand,
  collapseSystemRuns,
  filterAuditEntries,
  validateAuditFilters,
  type AuditEntry,
  type AuditFilters,
} from '@/lib/audit-ledger';
import {
  humanizeAudit,
  useCategories,
  useIncidents,
  useServices,
  useTechnicians,
} from '@/lib/incidents';
import { apiFetch } from '@/lib/api';

export const Route = createFileRoute('/audit')({
  validateSearch: validateAuditFilters,
  component: Audit,
});
const ACTIONS = [
  'IncidentCreated',
  'IncidentClassified',
  'IncidentAssigned',
  'IncidentAcknowledged',
  'WorkStarted',
  'InfoRequested',
  'InfoProvided',
  'IncidentResolved',
  'IncidentVerified',
  'IncidentReopened',
  'IncidentClosed',
  'SlaWarningRaised',
  'SlaBreached',
  'IncidentEscalated',
  'PriorityChanged',
  'NoteAdded',
  'FeedbackGiven',
];
const input =
  'h-10 min-w-0 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground sm:h-9';
const button =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-hover sm:min-h-9';
const CATEGORY_STYLE = {
  Lifecycle: { icon: ArrowRightLeft, tone: 'bg-low-subtle text-low-foreground' },
  Assignment: { icon: UserRoundCheck, tone: 'bg-primary-subtle text-primary-subtle-foreground' },
  'SLA warning': { icon: AlarmClock, tone: 'bg-warning-subtle text-warning-foreground' },
  'SLA breach': { icon: AlarmClockOff, tone: 'bg-critical-subtle text-critical-foreground' },
  Escalation: { icon: ArrowUpRight, tone: 'bg-high-subtle text-high-foreground' },
  Configuration: { icon: Settings, tone: 'bg-muted text-foreground' },
  Activity: { icon: MessageSquare, tone: 'bg-muted text-muted-foreground' },
};
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
function Actor({ actor }: { actor: AuditEntry['actor'] }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {actor ? (
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-2xs font-medium text-foreground"
        >
          {initials(actor.name)}
        </span>
      ) : (
        <Bot size={16} aria-hidden className="shrink-0" />
      )}
      <span className="break-words">{actor?.name ?? 'System'}</span>
    </span>
  );
}
function Audit() {
  const filters = useSearch({ from: '/audit' });
  const navigate = useNavigate({ from: '/audit' });
  const set = (patch: AuditFilters) =>
    void navigate({
      to: '/audit',
      search: (previous) => validateAuditFilters({ ...previous, ...patch }),
    });
  const range = useMemo(
    () => auditDateRange({ preset: filters.preset, from: filters.from, to: filters.to }),
    [filters.preset, filters.from, filters.to],
  );
  const audit = useAudit(
    auditSearch({
      ...range,
      action: filters.action,
      incidentId: filters.incidentId,
      actorId:
        filters.actor && !['people', 'system'].includes(filters.actor) ? filters.actor : undefined,
    }),
  );
  const incidents = useIncidents('limit=200');
  const technicians = useTechnicians(true);
  const services = useServices();
  const categories = useCategories();
  const metadata = new Map((incidents.data ?? []).map((i) => [i.id, i]));
  const missing = [...new Set((audit.data ?? []).map((e) => e.incident.id))].filter(
    (id) => !metadata.has(id),
  );
  // Audit omits service/priority. Fetch only missing snapshots when those filters need them.
  const extra = useQueries({
    queries: ((filters.priority || filters.service) && (incidents.data || incidents.isError)
      ? missing
      : []
    ).map((id) => ({
      queryKey: ['incident', id],
      queryFn: () => apiFetch(`/api/incidents/${id}`, IncidentDetailSchema),
      staleTime: 30000,
    })),
  });
  for (const query of extra) if (query.data) metadata.set(query.data.id, query.data);
  const people = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const t of technicians.data ?? []) people.set(t.id, t.name);
  for (const e of audit.data ?? []) if (e.actor) people.set(e.actor.id, e.actor.name);
  for (const i of metadata.values()) {
    labels.set(i.id, i.number);
    people.set(i.reporter.id, i.reporter.name);
    if (i.assignee) people.set(i.assignee.id, i.assignee.name);
  }
  for (const [id, name] of people) labels.set(id.toLowerCase(), name);
  for (const s of services.data ?? []) labels.set(s.id.toLowerCase(), s.name);
  for (const c of categories.data ?? []) labels.set(c.id.toLowerCase(), c.name);
  const entries = (audit.data ?? []).map((e) => ({
    ...e,
    narrative: humanizeAudit(
      labelIds(e.description.replace(e.incident.id, e.incident.number), labels),
      e.incident.number,
      e.actor?.name,
    ),
  }));
  const matches = filterAuditEntries(entries, filters, metadata);
  const runs = collapseSystemRuns(matches);
  const groups = new Map<string, typeof runs>();
  for (const run of runs) {
    const band = auditTimeBand(run[0]!.at);
    groups.set(band, [...(groups.get(band) ?? []), run]);
  }
  const selectedIncident =
    entries.find((e) => e.incident.id === filters.incidentId)?.incident.number ??
    labels.get(filters.incidentId ?? '') ??
    filters.incidentId;
  const chipLabels: Record<string, string> = {
    incidentId: `Incident: ${selectedIncident}`,
    actor: `Actor: ${filters.actor === 'people' ? 'People only' : filters.actor === 'system' ? 'System only' : (people.get(filters.actor ?? '') ?? filters.actor)}`,
    category: `Category: ${filters.category}`,
    action: `Action: ${auditActionLabel(filters.action ?? '')}`,
    priority: `Priority: ${filters.priority}`,
    service: `Service: ${services.data?.find((s) => s.id === filters.service)?.name ?? filters.service}`,
    preset: { today: 'Today', '24h': 'Last 24h', '7d': 'Last 7 days' }[filters.preset ?? ''] ?? '',
    from: `From: ${filters.from}`,
    to: `To: ${filters.to}`,
    q: `What happened: ${filters.q}`,
  };
  const metadataLoading =
    !!(filters.priority || filters.service) &&
    (incidents.isLoading || extra.some((q) => q.isPending));
  const metadataError =
    !!(filters.priority || filters.service) && (incidents.isError || extra.some((q) => q.isError));
  const incidentButton = (entry: AuditEntry) => (
    <button
      className="inline-flex min-h-10 items-center rounded px-1 text-xs font-medium tabular hover:bg-hover hover:underline sm:min-h-8"
      onClick={() => set({ incidentId: entry.incident.id })}
      aria-label={`Filter to incident ${entry.incident.number}`}
    >
      {entry.incident.number}
    </button>
  );
  const row = (entry: (typeof entries)[number], nested = false) => (
    <div
      className={`grid min-w-0 gap-x-4 gap-y-1 ${nested ? '' : 'sm:grid-cols-[76px_minmax(0,1fr)_156px]'}`}
    >
      <time
        dateTime={entry.at}
        title={new Date(entry.at).toLocaleString()}
        className="pt-1 text-xs text-muted-foreground tabular"
      >
        {new Date(entry.at).toLocaleTimeString('en-GB')}
      </time>
      <div className="min-w-0">
        <p className="pt-0.5 text-sm font-medium break-words">{entry.narrative}</p>
        <div className="flex flex-wrap items-center gap-x-2">
          {incidentButton(entry)}
          <span className="text-2xs text-muted-foreground">{auditActionLabel(entry.action)}</span>
        </div>
      </div>
      <div className="pt-1">
        <Actor actor={entry.actor} />
      </div>
    </div>
  );
  return (
    <AppShell>
      <header className="border-b border-border px-8 pt-5 pb-4 max-sm:px-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <History size={20} aria-hidden />
          Audit trail
        </h1>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 [&>label:first-child]:col-span-2 sm:[&>label:first-child]:col-span-1">
          <Field label="What happened">
            <span className="relative">
              <Search
                size={14}
                aria-hidden
                className="absolute top-3 left-2 text-muted-foreground"
              />
              <input
                type="search"
                className={`${input} pl-7`}
                value={filters.q ?? ''}
                onChange={(e) => set({ q: e.target.value })}
                placeholder="Search events"
              />
            </span>
          </Field>
          <Field label="Category">
            <select
              className={input}
              value={filters.category ?? ''}
              onChange={(e) => set({ category: e.target.value })}
            >
              <option value="">All categories</option>
              {AUDIT_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Actor">
            <select
              className={input}
              value={filters.actor ?? ''}
              onChange={(e) => set({ actor: e.target.value })}
            >
              <option value="">Everyone</option>
              <option value="people">People only</option>
              <option value="system">System only</option>
              {[...people]
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              className={input}
              value={filters.priority ?? ''}
              onChange={(e) => set({ priority: e.target.value })}
            >
              <option value="">Any priority</option>
              {['P1', 'P2', 'P3', 'P4'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Service">
            <select
              className={input}
              value={filters.service ?? ''}
              onChange={(e) => set({ service: e.target.value })}
            >
              <option value="">Any service</option>
              {services.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Action">
            <select
              className={input}
              value={filters.action ?? ''}
              onChange={(e) => set({ action: e.target.value })}
            >
              <option value="">Any action</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {auditActionLabel(a)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div role="group" aria-label="Date presets" className="flex flex-wrap gap-1">
            {[
              ['today', 'Today'],
              ['24h', 'Last 24h'],
              ['7d', 'Last 7 days'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`${button} ${filters.preset === key ? 'bg-muted font-semibold' : ''}`}
                aria-pressed={filters.preset === key}
                onClick={() => set({ preset: key, from: '', to: '' })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
            <Field label="From">
              <input
                type="date"
                className={input}
                value={filters.from ?? ''}
                max={filters.to || undefined}
                onChange={(e) => set({ from: e.target.value, preset: '' })}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className={input}
                value={filters.to ?? ''}
                min={filters.from || undefined}
                onChange={(e) => set({ to: e.target.value, preset: '' })}
              />
            </Field>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Active audit filters">
          {Object.entries(filters)
            .filter(([, v]) => v)
            .map(([key]) => (
              <button
                key={key}
                className={`${button} max-w-full bg-panel break-words`}
                onClick={() => set({ [key]: '' })}
                aria-label={`Remove ${chipLabels[key]} filter`}
              >
                <span className="min-w-0 break-all">{chipLabels[key]}</span>
                <X size={12} aria-hidden className="shrink-0" />
              </button>
            ))}
          {Object.keys(filters).length > 0 && (
            <button className={button} onClick={() => void navigate({ to: '/audit', search: {} })}>
              Clear all
            </button>
          )}
          {filters.incidentId && (
            <Link
              to="/incidents/$incidentId"
              params={{ incidentId: filters.incidentId }}
              className={`${button} underline`}
            >
              Open incident
            </Link>
          )}
          <span role="status" className="ml-auto text-xs text-muted-foreground tabular">
            {audit.isPlaceholderData
              ? 'Updating entries…'
              : metadataLoading
                ? 'Loading incident details…'
                : audit.data
                  ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} · ${audit.data.length >= 200 ? 'filtering the latest 200 entries' : `${audit.data.length} entries loaded`}`
                  : ''}
          </span>
        </div>
      </header>
      <div className="px-8 py-5 max-sm:px-4">
        {(filters.category ||
          filters.q ||
          filters.priority ||
          filters.service ||
          ['people', 'system'].includes(filters.actor ?? '')) && (
          <p className="mb-4 text-xs text-muted-foreground">
            Category, people/system, priority, service and text filters apply to the latest{' '}
            {audit.data?.length ?? 200} loaded entries. Priority and service use current incident
            details.
          </p>
        )}
        {metadataError && (
          <p role="alert" className="mb-3 text-xs text-critical-foreground">
            Some incident details could not load; priority and service matches may be incomplete.{' '}
            <button
              className="min-h-10 underline"
              onClick={() => {
                void incidents.refetch();
                for (const q of extra) if (q.isError) void q.refetch();
              }}
            >
              Retry details
            </button>
          </p>
        )}
        {audit.isLoading ? (
          <p role="status" className="py-8 text-sm text-muted-foreground">
            Loading audit entries…
          </p>
        ) : audit.isError ? (
          <p role="alert" className="py-8 text-sm text-critical-foreground">
            Could not load audit entries. {audit.error.message}{' '}
            <button className={button} onClick={() => void audit.refetch()}>
              Retry audit
            </button>
          </p>
        ) : !matches.length && !metadataLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No audit entries match.</p>
        ) : (
          <div aria-busy={audit.isFetching || metadataLoading}>
            {[...groups].map(([band, bandRuns]) => (
              <section key={band} aria-label={band} className="mb-6">
                <h2 className="sticky top-0 z-10 border-b border-border bg-background py-2 text-xs font-semibold text-muted-foreground tabular">
                  {band}
                </h2>
                <ol
                  aria-label={`Audit entries: ${band}`}
                  className="relative mt-3 before:absolute before:top-2 before:bottom-4 before:left-4 before:w-px before:bg-border"
                >
                  {bandRuns.map((run, index) => {
                    const entry = run[0]!;
                    const category = auditCategory(entry.action);
                    const style = CATEGORY_STYLE[category];
                    const Icon = style.icon;
                    return (
                      <li
                        key={`${entry.at}-${index}`}
                        className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-3"
                      >
                        <span
                          title={category}
                          className={`relative z-1 grid size-8 place-items-center rounded-md ring-4 ring-background ${style.tone}`}
                        >
                          <Icon size={16} aria-hidden />
                          <span className="sr-only">{category}</span>
                        </span>
                        {run.length === 1 ? (
                          row(entry)
                        ) : (
                          <details className="group min-w-0 rounded-md border border-border bg-panel">
                            <summary className="grid min-h-10 cursor-pointer list-none grid-cols-[14px_minmax(0,1fr)] items-start gap-2 p-3 sm:flex sm:items-center [&::-webkit-details-marker]:hidden">
                              <ChevronDown
                                size={14}
                                aria-hidden
                                className="shrink-0 group-open:rotate-180"
                              />
                              <span className="min-w-0 flex-1 text-sm font-medium break-words">
                                {entry.narrative}
                              </span>
                              <span className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 sm:ml-auto">
                                <span className="text-xs text-muted-foreground tabular">
                                  {run.length} events ·{' '}
                                  {new Date(entry.at).toLocaleTimeString('en-GB')}
                                </span>
                                <Actor actor={null} />
                              </span>
                            </summary>
                            <ol
                              aria-label="Grouped system events"
                              className="divide-y divide-border border-t border-border px-3"
                            >
                              {run.map((e, i) => (
                                <li key={i} className="py-3">
                                  {row(e, true)}
                                </li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
