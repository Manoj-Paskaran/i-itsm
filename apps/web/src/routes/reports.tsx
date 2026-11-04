import type { TrendReport } from '@itsm/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { formatMinutes, linePath, nearestIndex, niceMax, percent, ticks } from '@/lib/charts';
import { useOverview, useServiceReport, useSlaReport, useTrends, useWorkload } from '@/lib/reports';

export const Route = createFileRoute('/reports')({ component: Reports });

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
const Skeleton = () => <div className="h-40 animate-pulse rounded bg-muted" />;

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
        <p className="text-sm text-muted-foreground">
          Read-only figures from the API, refreshed every 30 seconds.
          {o && ` ${o.total.toLocaleString('en-IN')} incidents in total.`}
        </p>
      </header>
      <div className="space-y-4 px-8 py-5 max-sm:px-4">
        <dl className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-sm:grid-cols-2">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border p-4">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular">
                {overview.isLoading ? '…' : (value ?? '—')}
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
    <Card title="Reported and resolved per day" hint="Last 30 days.">
      <div className="-mt-9 mb-2 flex justify-end">
        <button
          className="h-7 rounded-md border border-border px-2.5 text-xs hover:bg-hover"
          aria-pressed={table}
          onClick={() => setTable(!table)}
        >
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {!trends.data ? (
        <Skeleton />
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
      <ul className="mb-2 flex gap-4 text-xs text-muted-foreground" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="flex pr-20">
        <div className="relative w-8 shrink-0 text-right text-2xs text-muted-foreground tabular">
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
          className="relative h-[180px] flex-1"
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
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {last &&
            SERIES.map((s, i) => {
              // Direct label at the line end; nudge the second label if the two would overlap.
              const top = (1 - last[s.key] / max) * 100;
              const other = (1 - last[SERIES[1 - i]!.key] / max) * 100;
              const nudge = i === 1 && Math.abs(top - other) < 10 ? (top >= other ? 10 : -10) : 0;
              return (
                <span
                  key={s.key}
                  aria-hidden
                  className="absolute left-full ml-2 -translate-y-1/2 text-2xs whitespace-nowrap text-muted-foreground tabular"
                  style={{ top: `${top + nudge}%` }}
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
      <div className="ml-8 flex justify-between pt-1 text-2xs text-muted-foreground tabular">
        <span>{days[0] && dayLabel(days[0].date)}</span>
        <span>{last && dayLabel(last.date)}</span>
      </div>
    </div>
  );
}

function TrendTable({ days }: { days: TrendReport['days'] }) {
  return (
    <div className="max-h-[220px] overflow-auto">
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

/** A single-series horizontal bar: label, a thin bar, the value in text ink. */
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
    <li className="group relative grid grid-cols-[112px_1fr_56px] items-center gap-3 py-1">
      <span className="truncate text-sm">{label}</span>
      <span className="h-2 rounded-full bg-muted">
        <span
          className="block h-2 rounded-full bg-series-1"
          style={{ width: `${Math.min(1, Math.max(0, ratio)) * 100}%` }}
        />
      </span>
      <span className="text-right text-sm font-medium tabular">{value}</span>
      <span className="pointer-events-none absolute -top-7 left-28 z-10 hidden rounded-md border border-border bg-card px-2 py-1 text-xs shadow-pop group-hover:block">
        {detail}
      </span>
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
          ? `${percent(sla.data.compliance)} of incidents with a settled SLA met it.`
          : undefined
      }
    >
      {!sla.data ? (
        <Skeleton />
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
      hint="Assigned incidents not yet closed, against each technician's capacity."
    >
      {!workload.data ? (
        <Skeleton />
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
  return (
    <Card title="Incidents by service">
      {!services.data ? (
        <Skeleton />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
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
