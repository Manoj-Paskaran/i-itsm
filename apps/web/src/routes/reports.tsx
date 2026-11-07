import type { TrendReport } from '@itsm/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { formatMinutes, linePath, nearestIndex, niceMax, percent, ticks } from '@/lib/charts';
import { useOverview, useServiceReport, useSlaReport, useTrends, useWorkload } from '@/lib/reports';

export const Route = createFileRoute('/reports')({ component: Reports });

function Card({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
const Skeleton = () => (
  <div role="status" className="h-40 animate-pulse rounded bg-muted">
    <span className="sr-only">Loading report…</span>
  </div>
);
const Empty = ({ children }: { children: ReactNode }) => (
  <p className="py-6 text-sm text-muted-foreground">{children}</p>
);
function ReportError({ retry }: { retry: () => unknown }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 py-3 text-sm text-critical-foreground"
    >
      Could not load this report.
      <button
        className="min-h-10 rounded-md border border-border px-3 text-foreground hover:bg-hover sm:min-h-8"
        onClick={() => void retry()}
      >
        Retry report
      </button>
    </div>
  );
}

function Reports() {
  const overview = useOverview();
  const o = overview.data;
  const tiles = [
    ['Not closed', o?.open],
    ['P1 not closed', o?.critical],
    ['Resolved', o?.resolved],
    ['SLA violations', o?.slaViolations],
    ['Duplicates', o?.duplicates],
    ['Avg time to resolve', o ? formatMinutes(o.avgResolutionMinutes) : undefined],
  ] as const;
  return (
    <AppShell>
      <header className="border-b border-border px-8 pt-5 pb-4 max-sm:px-4">
        <h1 className="text-xl font-semibold">Reports</h1>
        {o && (
          <span className="text-xs text-muted-foreground tabular">
            {o.total.toLocaleString('en-IN')} incidents
          </span>
        )}
      </header>
      <div className="space-y-4 px-8 py-5 max-sm:px-4">
        {overview.isError && <ReportError retry={overview.refetch} />}
        <dl className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-sm:grid-cols-2">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border p-4">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular">
                {overview.isLoading
                  ? '…'
                  : typeof value === 'number'
                    ? value.toLocaleString('en-IN')
                    : (value ?? '—')}
              </dd>
            </div>
          ))}
        </dl>
        <Trends />
        <div className="grid gap-4 lg:grid-cols-2">
          <SlaByPriority />
          <Workload />
        </div>
        <Services />
      </div>
    </AppShell>
  );
}

const SERIES = [
  { key: 'created', label: 'Reported', color: 'var(--series-1)' },
  { key: 'resolved', label: 'Resolved', color: 'var(--series-2)' },
] as const;
const W = 600;
const H = 180;
const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function Trends() {
  const trends = useTrends();
  const [table, setTable] = useState(false);
  return (
    <Card
      title="Reported and resolved per day"
      hint="Last 30 days."
      action={
        <button
          className="h-10 shrink-0 rounded-md border border-border px-3 text-xs hover:bg-hover sm:h-8"
          aria-pressed={table}
          onClick={() => setTable(!table)}
        >
          {table ? 'Show chart' : 'Show table'}
        </button>
      }
    >
      {trends.isError ? (
        <ReportError retry={trends.refetch} />
      ) : !trends.data ? (
        <Skeleton />
      ) : !trends.data.days.length ? (
        <Empty>No daily incident data for this period.</Empty>
      ) : table ? (
        <TrendTable days={trends.data.days} />
      ) : (
        <TrendChart days={trends.data.days} />
      )}
    </Card>
  );
}

function TrendChart({ days }: { days: TrendReport['days'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...days.flatMap((d) => [d.created, d.resolved])));
  const last = days[days.length - 1];
  const point = hover === null ? null : days[hover];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Incidents</span>
        <ul className="flex gap-4" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <svg width="16" height="4" aria-hidden>
                <line
                  x1="0"
                  x2="16"
                  y1="2"
                  y2="2"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeDasharray={s.key === 'resolved' ? '4 3' : undefined}
                />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex pr-20">
        <div className="relative w-8 shrink-0 text-right text-xs text-muted-foreground tabular">
          {ticks(max).map((t) => (
            <span
              key={t}
              className="absolute right-2 -translate-y-1/2"
              style={{ top: `${(1 - t / max) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>
        <div
          ref={ref}
          className="relative h-[180px] min-w-0 flex-1"
          onPointerMove={(e) => {
            const box = ref.current?.getBoundingClientRect();
            if (box) setHover(nearestIndex(e.clientX - box.left, box.width, days.length));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            role="img"
            aria-label={`Reported and resolved incidents per day; last day ${last?.created ?? 0} reported, ${last?.resolved ?? 0} resolved.`}
          >
            {ticks(max).map((t) => (
              <line
                key={t}
                x1={0}
                x2={W}
                y1={H - (t / max) * H}
                y2={H - (t / max) * H}
                stroke="var(--border)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hover !== null && (
              <line
                x1={(hover / Math.max(1, days.length - 1)) * W}
                x2={(hover / Math.max(1, days.length - 1)) * W}
                y1={0}
                y2={H}
                stroke="var(--border-strong)"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {SERIES.map((s) => (
              <path
                key={s.key}
                d={linePath(
                  days.map((d) => d[s.key]),
                  W,
                  H,
                  max,
                )}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.key === 'resolved' ? '6 4' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {last &&
            SERIES.map((s, i) => {
              // Separate coincident endpoints while keeping labels inside the plot height.
              const top = (1 - last[s.key] / max) * 100;
              const other = (1 - last[SERIES[1 - i]!.key] / max) * 100;
              const labelTop =
                Math.abs(top - other) < 12
                  ? i === 0
                    ? Math.max(4, Math.min(82, top - 6))
                    : Math.max(16, Math.min(96, top + 6))
                  : Math.max(4, Math.min(96, top));
              return (
                <span
                  key={s.key}
                  aria-hidden
                  className="absolute left-full ml-2 -translate-y-1/2 text-xs whitespace-nowrap text-muted-foreground tabular"
                  style={{ top: `${labelTop}%` }}
                >
                  {s.label} {last[s.key]}
                </span>
              );
            })}
          {point && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-36 rounded-md border border-border bg-card p-2 text-xs shadow-pop"
              style={{
                left: `${(hover / Math.max(1, days.length - 1)) * 100}%`,
                transform: `translateX(${hover > days.length / 2 ? 'calc(-100% - 8px)' : '8px'})`,
              }}
            >
              <div className="font-medium">{dayLabel(point.date)}</div>
              {SERIES.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-2 tabular">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-0.5 w-3 rounded" style={{ background: s.color }} />
                    {s.label}
                  </span>
                  {point[s.key]}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="ml-8 flex justify-between pt-2 pr-20 text-xs text-muted-foreground tabular">
        <span>{days[0] && dayLabel(days[0].date)}</span>
        <span>{last && dayLabel(last.date)}</span>
      </div>
    </div>
  );
}

function TrendTable({ days }: { days: TrendReport['days'] }) {
  return (
    <div
      className="max-h-[280px] overflow-auto"
      role="region"
      tabIndex={0}
      aria-label="Daily incident counts"
    >
      <table className="w-full text-sm tabular">
        <thead className="sticky top-0 bg-background text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1 font-medium">Day</th>
            <th className="py-1 text-right font-medium">Reported</th>
            <th className="py-1 text-right font-medium">Resolved</th>
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((d) => (
            <tr key={d.date} className="border-t border-border">
              <td className="py-1">{dayLabel(d.date)}</td>
              <td className="py-1 text-right">{d.created}</td>
              <td className="py-1 text-right">{d.resolved}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A single-series comparison with a keyboard- and touch-accessible breakdown. */
function Bar({
  label,
  value,
  ratio,
  detail,
}: {
  label: string;
  value: string;
  ratio: number;
  detail: string;
}) {
  return (
    <li>
      <details className="group rounded-md open:bg-panel">
        <summary className="grid min-h-10 cursor-pointer list-none grid-cols-[minmax(0,1fr)_minmax(40px,1fr)_auto] items-center gap-3 rounded-md py-1 text-sm hover:bg-hover sm:min-h-8 sm:grid-cols-[minmax(112px,1fr)_minmax(0,3fr)_56px] [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-1.5">
            <ChevronDown size={12} aria-hidden className="shrink-0 group-open:rotate-180" />
            <span className="break-words">{label}</span>
          </span>
          <span aria-hidden className="h-2 rounded-full bg-muted">
            <span
              className="block h-2 rounded-full bg-series-1"
              style={{ width: `${Math.min(1, Math.max(0, ratio)) * 100}%` }}
            />
          </span>
          <span className="text-right text-sm font-medium tabular">{value}</span>
        </summary>
        <p className="px-4 pt-1 pb-3 text-xs text-muted-foreground tabular">{detail}</p>
      </details>
    </li>
  );
}

function SlaByPriority() {
  const sla = useSlaReport();
  return (
    <Card
      title="SLA compliance by priority"
      hint={
        sla.data
          ? sla.data.compliance === null
            ? 'No settled SLAs yet. Select a row for details.'
            : `${percent(sla.data.compliance)} of settled SLAs met. Select a row for details.`
          : undefined
      }
    >
      {sla.isError ? (
        <ReportError retry={sla.refetch} />
      ) : !sla.data ? (
        <Skeleton />
      ) : !sla.data.byPriority.length ? (
        <Empty>No SLA data available.</Empty>
      ) : (
        <ul>
          {sla.data.byPriority.map((p) => (
            <Bar
              key={p.priority}
              label={p.priority}
              value={percent(p.compliance)}
              ratio={p.compliance ?? 0}
              detail={`${p.met} met · ${p.breached} breached`}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function Workload() {
  const workload = useWorkload();
  return (
    <Card
      title="Technician workload"
      hint="Assigned incidents not yet closed / capacity. Select a row for details."
    >
      {workload.isError ? (
        <ReportError retry={workload.refetch} />
      ) : !workload.data ? (
        <Skeleton />
      ) : !workload.data.length ? (
        <Empty>No technician workload to show.</Empty>
      ) : (
        <ul>
          {[...workload.data]
            .sort((a, b) => b.utilisation - a.utilisation)
            .map((w) => (
              <Bar
                key={w.technician.id}
                label={w.technician.name}
                value={`${w.active}/${w.capacity}`}
                ratio={w.utilisation}
                detail={`${percent(w.utilisation)} used · ${w.resolvedLast30Days} resolved in 30 days · ${w.availability.replace('_', ' ').toLowerCase()}`}
              />
            ))}
        </ul>
      )}
    </Card>
  );
}

function Services() {
  const services = useServiceReport();
  const [table, setTable] = useState(false);
  const rows = [...(services.data ?? [])].sort((a, b) => b.total - a.total);
  const max = niceMax(Math.max(0, ...rows.map((s) => s.total)));
  return (
    <Card
      title="Incidents by service"
      hint="Counts can overlap: SLA violations may include incidents that are not closed."
      action={
        <button
          className="h-10 shrink-0 rounded-md border border-border px-3 text-xs hover:bg-hover sm:h-8"
          aria-pressed={table}
          onClick={() => setTable(!table)}
        >
          {table ? 'Show chart' : 'Show table'}
        </button>
      }
    >
      {services.isError ? (
        <ReportError retry={services.refetch} />
      ) : !services.data ? (
        <Skeleton />
      ) : !services.data.length ? (
        <Empty>No service incidents to show.</Empty>
      ) : !table ? (
        <div>
          <ul
            aria-label="Service chart legend"
            className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground"
          >
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-4 rounded bg-border-strong" />
              Total
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-4 rounded bg-series-1" />
              Not closed
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full border-2 border-series-2" />
              SLA violations
            </li>
          </ul>
          <ul aria-label="Service incident counts" className="space-y-1">
            {rows.map((s) => (
              <li key={s.service.id}>
                <details className="group rounded-md open:bg-panel">
                  <summary className="grid min-h-10 cursor-pointer list-none gap-2 rounded-md py-2 hover:bg-hover sm:grid-cols-[minmax(120px,1fr)_3fr_72px] sm:items-center sm:gap-4 [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-1.5 text-sm">
                      <ChevronDown
                        aria-hidden
                        size={12}
                        className="shrink-0 group-open:rotate-180"
                      />
                      {s.service.name}
                    </span>
                    <span aria-hidden className="space-y-1">
                      <span className="relative block h-2 rounded bg-muted">
                        <span
                          className="block h-2 rounded bg-border-strong"
                          style={{ width: `${(s.total / max) * 100}%` }}
                        />
                      </span>
                      <span className="relative block h-2 rounded bg-muted">
                        <span
                          className="block h-2 rounded bg-series-1"
                          style={{ width: `${(s.open / max) * 100}%` }}
                        />
                        <span
                          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-series-2 bg-background"
                          style={{ left: `${(s.slaViolations / max) * 100}%` }}
                        />
                      </span>
                    </span>
                    <span className="text-xs font-medium tabular sm:text-right">
                      {s.total} total
                    </span>
                    <span className="text-xs text-muted-foreground tabular sm:col-start-2 sm:col-end-4">
                      {s.open} not closed · {s.slaViolations} SLA violations
                    </span>
                  </summary>
                  <p className="px-4 pb-3 text-xs text-muted-foreground tabular">
                    {s.service.name}: {s.total} total incidents, {s.open} not closed,{' '}
                    {s.slaViolations} SLA violations.
                  </p>
                </details>
              </li>
            ))}
          </ul>
          <div
            aria-hidden
            className="mt-2 flex justify-between text-2xs text-muted-foreground tabular"
          >
            <span>0 incidents</span>
            <span>{max}</span>
          </div>
        </div>
      ) : (
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Incidents by service"
        >
          <table className="w-full min-w-[440px] text-sm tabular">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Service</th>
                <th className="py-1.5 text-right font-medium">Total</th>
                <th className="py-1.5 text-right font-medium">Not closed</th>
                <th className="py-1.5 text-right font-medium">SLA violations</th>
              </tr>
            </thead>
            <tbody>
              {[...services.data]
                .sort((a, b) => b.total - a.total)
                .map((s) => (
                  <tr key={s.service.id} className="border-t border-border">
                    <td className="py-1.5">{s.service.name}</td>
                    <td className="py-1.5 text-right">{s.total}</td>
                    <td className="py-1.5 text-right">{s.open}</td>
                    <td className="py-1.5 text-right">{s.slaViolations}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
