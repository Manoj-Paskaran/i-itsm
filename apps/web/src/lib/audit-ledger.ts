import type { IncidentSummary } from '@itsm/contracts';
import { AuditLogEntrySchema } from '@itsm/contracts';
export type AuditEntry = ReturnType<typeof AuditLogEntrySchema.parse>;
export const AUDIT_CATEGORIES = [
  'Lifecycle',
  'Assignment',
  'SLA warning',
  'SLA breach',
  'Escalation',
  'Configuration',
  'Activity',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
export type AuditFilters = Partial<
  Record<
    | 'incidentId'
    | 'actor'
    | 'action'
    | 'category'
    | 'priority'
    | 'service'
    | 'preset'
    | 'from'
    | 'to'
    | 'q',
    string
  >
>;
const keys = [
  'incidentId',
  'actor',
  'action',
  'category',
  'priority',
  'service',
  'preset',
  'from',
  'to',
  'q',
] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateAuditFilters(search: Record<string, unknown>): AuditFilters {
  const result: AuditFilters = {};
  for (const key of keys)
    if (typeof search[key] === 'string' && search[key]) result[key] = search[key];
  if (result.incidentId && !uuid.test(result.incidentId)) delete result.incidentId;
  if (result.actor && !['people', 'system'].includes(result.actor) && !uuid.test(result.actor))
    delete result.actor;
  if (result.service && !uuid.test(result.service)) delete result.service;
  if (result.category && !AUDIT_CATEGORIES.includes(result.category as AuditCategory))
    delete result.category;
  if (result.priority && !/^P[1-4]$/.test(result.priority)) delete result.priority;
  if (result.preset && !['today', '24h', '7d'].includes(result.preset)) delete result.preset;
  for (const key of ['from', 'to'] as const)
    if (
      result[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(result[key]) || !Number.isFinite(Date.parse(result[key])))
    )
      delete result[key];
  return result;
}
export function auditCategory(action: string): AuditCategory {
  if (action === 'SlaWarningRaised') return 'SLA warning';
  if (action === 'SlaBreached') return 'SLA breach';
  if (action === 'IncidentEscalated') return 'Escalation';
  if (/Assign/.test(action)) return 'Assignment';
  if (/Config|Policy|Strategy|Service|Category|User|Technician/.test(action))
    return 'Configuration';
  if (['NoteAdded', 'FeedbackGiven', 'InfoRequested', 'InfoProvided'].includes(action))
    return 'Activity';
  return 'Lifecycle';
}
export function auditDateRange(filters: AuditFilters, now = new Date()) {
  if (!filters.preset) return { from: filters.from, to: filters.to };
  const end = now.toISOString();
  const start =
    filters.preset === 'today'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : new Date(now.getTime() - (filters.preset === '24h' ? 1 : 7) * 86400000);
  return { from: start.toISOString(), to: end };
}
export function filterAuditEntries<T extends AuditEntry & { narrative: string }>(
  entries: T[],
  filters: AuditFilters,
  incidents: ReadonlyMap<string, Pick<IncidentSummary, 'priority' | 'service'>>,
) {
  return entries.filter(
    (e) =>
      (!filters.category || auditCategory(e.action) === filters.category) &&
      (!filters.actor ||
        (filters.actor === 'people'
          ? !!e.actor
          : filters.actor === 'system'
            ? !e.actor
            : e.actor?.id === filters.actor)) &&
      (!filters.q || e.narrative.toLocaleLowerCase().includes(filters.q.toLocaleLowerCase())) &&
      (!filters.priority || incidents.get(e.incident.id)?.priority === filters.priority) &&
      (!filters.service || incidents.get(e.incident.id)?.service.id === filters.service),
  );
}
/** Consecutive system events with identical meaning in the same second become one disclosure. */
export function collapseSystemRuns<T extends AuditEntry & { narrative: string }>(
  entries: T[],
): T[][] {
  const runs: T[][] = [];
  for (const entry of entries) {
    const last = runs.at(-1);
    const previous = last?.[0];
    if (
      previous &&
      !previous.actor &&
      !entry.actor &&
      previous.action === entry.action &&
      previous.narrative === entry.narrative &&
      Math.floor(Date.parse(previous.at) / 1000) === Math.floor(Date.parse(entry.at) / 1000)
    )
      last.push(entry);
    else runs.push([entry]);
  }
  return runs;
}
export function auditTimeBand(value: string) {
  const date = new Date(value);
  const hour = date.getHours();
  const band = hour < 6 ? 'Overnight' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  return `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${band}`;
}
