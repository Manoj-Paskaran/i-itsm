import { Inject, Injectable } from '@nestjs/common';
import {
  IncidentStatusSchema,
  PrioritySchema,
  type OverviewReport,
  type SlaReport,
} from '@itsm/contracts';
import { sql } from 'drizzle-orm';
import type { Instant } from '../../../domain/shared/index.js';
import { INCIDENT_REPOSITORY, type IncidentRepository } from '../../../ports/repositories.js';
import type { ReportQueries } from '../../../ports/reports.js';
import { DB, type Database } from '../database.js';

const isDuplicate = sql`closure_reason = 'DUPLICATE'`;
const isNotDuplicate = sql`coalesce(closure_reason <> 'DUPLICATE', true)`;
const isResolved = sql`status in ('RESOLVED','VERIFIED','CLOSED') and coalesce(closure_reason <> 'DUPLICATE', true)`;
const hasBreach = sql`coalesce(cardinality(sla_breached), 0) > 0`;
const isMet = sql`sla_resolved_at is not null and not (${hasBreach})`;
const rate = (met: number, breached: number) => (met + breached ? met / (met + breached) : null);
@Injectable()
export class DrizzleReportQueries implements ReportQueries {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepository,
  ) {}
  async overview(now: Instant): Promise<OverviewReport> {
    void now;
    const [summary, statuses, priorities] = await Promise.all([
      this.db.execute<{
        total: number;
        open: number;
        critical: number;
        resolved: number;
        violations: number;
        duplicates: number;
        average: number | null;
      }>(
        sql`select count(*)::int total, count(*) filter (where status <> 'CLOSED')::int open, count(*) filter (where status <> 'CLOSED' and priority = 'P1')::int critical, count(*) filter (where ${isResolved})::int resolved, count(*) filter (where ${hasBreach} and ${isNotDuplicate})::int violations, count(*) filter (where ${isDuplicate})::int duplicates, (avg(extract(epoch from (resolution_resolved_at - created_at)) / 60) filter (where ${isResolved}))::float8 average from incidents`,
      ),
      this.db.execute<{ status: keyof OverviewReport['byStatus']; count: number }>(
        sql`select status, count(*)::int count from incidents group by status`,
      ),
      this.db.execute<{ priority: keyof OverviewReport['byPriority']; count: number }>(
        sql`select priority, count(*)::int count from incidents where priority is not null group by priority`,
      ),
    ]);
    const r = summary.rows[0]!;
    const byStatus = Object.fromEntries(
      IncidentStatusSchema.options.map((s) => [s, 0]),
    ) as OverviewReport['byStatus'];
    const byPriority = Object.fromEntries(
      PrioritySchema.options.map((p) => [p, 0]),
    ) as OverviewReport['byPriority'];
    for (const row of statuses.rows) byStatus[row.status] = row.count;
    for (const row of priorities.rows) byPriority[row.priority] = row.count;
    return {
      total: r.total,
      open: r.open,
      critical: r.critical,
      resolved: r.resolved,
      slaViolations: r.violations,
      duplicates: r.duplicates,
      avgResolutionMinutes: r.average,
      byStatus,
      byPriority,
    };
  }
  async workload(now: Instant) {
    const result = await this.db.execute<{
      id: string;
      name: string;
      role: 'TECHNICIAN' | 'TEAM_LEAD';
      active: number;
      capacity: number;
      availability: 'AVAILABLE' | 'BUSY' | 'OFF_SHIFT' | 'ON_LEAVE';
      recent: number;
    }>(sql`select u.id, u.name, u.role, u.max_active_incidents capacity, u.availability,
      count(i.id) filter (where i.status <> 'CLOSED' and i.assignee_id = u.id)::int active,
      count(i.id) filter (where ${isResolved} and i.resolution_resolved_by = u.id and i.resolution_resolved_at >= ${new Date(now.ms - 30 * 86400000)} and i.resolution_resolved_at <= ${now.toDate()})::int recent
      from users u left join incidents i on i.assignee_id = u.id or i.resolution_resolved_by = u.id
      where u.role in ('TECHNICIAN','TEAM_LEAD') group by u.id order by u.id`);
    return result.rows.map((r) => ({
      technician: { id: r.id, name: r.name },
      role: r.role,
      active: r.active,
      capacity: r.capacity,
      utilisation: r.capacity ? r.active / r.capacity : 0,
      resolvedLast30Days: r.recent,
      availability: r.availability,
    }));
  }
  async services() {
    const result = await this.db.execute<{
      id: string;
      name: string;
      criticality: number;
      total: number;
      open: number;
      violations: number;
    }>(
      sql`select s.id,s.name,s.criticality, count(i.id)::int total, count(i.id) filter (where i.status <> 'CLOSED')::int open, count(i.id) filter (where ${hasBreach} and ${isNotDuplicate})::int violations from it_services s left join incidents i on i.service_id=s.id group by s.id order by total desc,s.id`,
    );
    return result.rows.map((r) => ({
      service: { id: r.id, name: r.name, criticality: r.criticality },
      total: r.total,
      open: r.open,
      slaViolations: r.violations,
    }));
  }
  async sla(now: Instant): Promise<SlaReport> {
    const [result, openIncidents] = await Promise.all([
      this.db.execute<{
        priority: 'P1' | 'P2' | 'P3' | 'P4' | null;
        met: number;
        breached: number;
        breached_open: number;
      }>(
        sql`select priority, count(*) filter (where ${isMet})::int met, count(*) filter (where ${hasBreach})::int breached, count(*) filter (where ${hasBreach} and status <> 'CLOSED')::int breached_open from incidents where coalesce(closure_reason <> 'DUPLICATE',true) group by priority`,
      ),
      this.incidents.listOpenClassified(),
    ]);
    const met = result.rows.reduce((n, r) => n + r.met, 0),
      breached = result.rows.reduce((n, r) => n + r.breached, 0);
    return {
      met,
      breached,
      compliance: rate(met, breached),
      breachedOpen: result.rows.reduce((n, r) => n + r.breached_open, 0),
      atRiskNow: openIncidents.filter((i) => i.slaStatus(now) === 'AT_RISK').length,
      byPriority: PrioritySchema.options.map((priority) => {
        const row = result.rows.find((r) => r.priority === priority);
        const m = row?.met ?? 0,
          b = row?.breached ?? 0;
        return { priority, met: m, breached: b, compliance: rate(m, b) };
      }),
    };
  }
  async trends(days: number, now: Instant) {
    const today = new Date(
      Date.UTC(
        now.toDate().getUTCFullYear(),
        now.toDate().getUTCMonth(),
        now.toDate().getUTCDate(),
      ),
    );
    const result = await this.db.execute<{ date: string; created: number; resolved: number }>(
      sql`select to_char(d.day,'YYYY-MM-DD') date, count(i.id) filter (where (i.created_at at time zone 'UTC')::date=d.day)::int created, count(i.id) filter (where ${isResolved} and (i.resolution_resolved_at at time zone 'UTC')::date=d.day)::int resolved from generate_series((${today}::timestamptz at time zone 'UTC')::date - (${days}::int - 1), (${today}::timestamptz at time zone 'UTC')::date, interval '1 day') d(day) left join incidents i on (i.created_at at time zone 'UTC')::date=d.day or (i.resolution_resolved_at at time zone 'UTC')::date=d.day group by d.day order by d.day`,
    );
    return { days: result.rows };
  }
}
