/* eslint-disable @typescript-eslint/require-await -- In-memory query implementation. */
import {
  IncidentStatusSchema,
  PrioritySchema,
  type OverviewReport,
  type SlaReport,
} from '@itsm/contracts';
import { Incident, type IncidentSnapshot } from '../../domain/incidents/index.js';
import type { ItService } from '../../domain/catalog/index.js';
import type { Technician } from '../../domain/users/index.js';
import type { Instant } from '../../domain/shared/index.js';
import type { ReportQueries } from '../../ports/reports.js';

const open = (s: IncidentSnapshot) => s.status !== 'CLOSED';
const duplicate = (s: IncidentSnapshot) => s.closure?.reason === 'DUPLICATE';
const breached = (s: IncidentSnapshot) => (s.slaClock?.breached.length ?? 0) > 0;
const resolved = (s: IncidentSnapshot) =>
  !duplicate(s) && ['RESOLVED', 'VERIFIED', 'CLOSED'].includes(s.status);
const ratio = (met: number, bad: number) => (met + bad === 0 ? null : met / (met + bad));
export class InMemoryReportQueries implements ReportQueries {
  constructor(
    private readonly incidents: readonly IncidentSnapshot[],
    private readonly technicians: readonly Technician[],
    private readonly catalog: readonly ItService[],
  ) {}
  async overview(now: Instant): Promise<OverviewReport> {
    void now;
    const byStatus = Object.fromEntries(
      IncidentStatusSchema.options.map((s) => [s, 0]),
    ) as OverviewReport['byStatus'];
    const byPriority = Object.fromEntries(
      PrioritySchema.options.map((p) => [p, 0]),
    ) as OverviewReport['byPriority'];
    let totalMinutes = 0,
      timed = 0;
    for (const s of this.incidents) {
      byStatus[s.status]++;
      if (s.priority) byPriority[s.priority]++;
      if (resolved(s) && s.resolution) {
        totalMinutes += (Date.parse(s.resolution.at) - Date.parse(s.createdAt)) / 60000;
        timed++;
      }
    }
    return {
      total: this.incidents.length,
      open: this.incidents.filter(open).length,
      critical: this.incidents.filter((s) => open(s) && s.priority === 'P1').length,
      resolved: this.incidents.filter(resolved).length,
      // Duplicates are tracked on their original, so they never count as violations.
      slaViolations: this.incidents.filter((s) => breached(s) && !duplicate(s)).length,
      duplicates: this.incidents.filter(duplicate).length,
      byStatus,
      byPriority,
      avgResolutionMinutes: timed ? totalMinutes / timed : null,
    };
  }
  async workload(now: Instant) {
    const start = now.ms - 30 * 86400000;
    return this.technicians
      .map((t) => {
        const active = this.incidents.filter((s) => s.assigneeId === t.id() && open(s)).length;
        return {
          technician: { id: t.id(), name: t.name() },
          role: t.role(),
          active,
          capacity: t.capacity(),
          utilisation: active / t.capacity(),
          resolvedLast30Days: this.incidents.filter(
            (s) =>
              resolved(s) &&
              s.resolution?.resolvedBy === t.id() &&
              Date.parse(s.resolution.at) >= start &&
              Date.parse(s.resolution.at) <= now.ms,
          ).length,
          availability: t.availabilityStatus(),
        };
      })
      .sort((a, b) => a.technician.id.localeCompare(b.technician.id));
  }
  async services() {
    return this.catalog
      .map((s) => {
        const matches = this.incidents.filter((i) => i.serviceId === s.id());
        return {
          service: { id: s.id(), name: s.name(), criticality: s.businessCriticality().value },
          total: matches.length,
          open: matches.filter(open).length,
          slaViolations: matches.filter((s) => breached(s) && !duplicate(s)).length,
        };
      })
      .sort((a, b) => b.total - a.total || a.service.id.localeCompare(b.service.id));
  }
  async sla(now: Instant): Promise<SlaReport> {
    const eligible = this.incidents.filter((s) => !duplicate(s));
    const met = (s: IncidentSnapshot) => !!s.slaClock?.resolvedAt && !breached(s);
    const good = eligible.filter(met).length,
      bad = eligible.filter(breached).length;
    return {
      met: good,
      breached: bad,
      compliance: ratio(good, bad),
      atRiskNow: eligible.filter(
        (s) => open(s) && Incident.rehydrate(s).slaStatus(now) === 'AT_RISK',
      ).length,
      breachedOpen: eligible.filter((s) => open(s) && breached(s)).length,
      byPriority: PrioritySchema.options.map((priority) => {
        const subset = eligible.filter((s) => s.priority === priority);
        const m = subset.filter(met).length,
          b = subset.filter(breached).length;
        return { priority, met: m, breached: b, compliance: ratio(m, b) };
      }),
    };
  }
  async trends(days: number, now: Instant) {
    const today = Date.UTC(
      now.toDate().getUTCFullYear(),
      now.toDate().getUTCMonth(),
      now.toDate().getUTCDate(),
    );
    return {
      days: Array.from({ length: days }, (_, i) => {
        const date = new Date(today - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
        return {
          date,
          created: this.incidents.filter((s) => s.createdAt.slice(0, 10) === date).length,
          resolved: this.incidents.filter(
            (s) => resolved(s) && s.resolution?.at.slice(0, 10) === date,
          ).length,
        };
      }),
    };
  }
}
