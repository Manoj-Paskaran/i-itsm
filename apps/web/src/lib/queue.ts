import type { IncidentSummary } from '@itsm/contracts';

export type QueueTab = 'open' | 'closed' | 'all';
export type QueueSort = 'newest' | 'oldest' | 'priority' | 'status';
export type Escalation = IncidentSummary['escalationLevel'];

const DONE = new Set<IncidentSummary['status']>(['VERIFIED', 'CLOSED']);
/** Open means anything not verified or closed. */
export const isOpen = (incident: Pick<IncidentSummary, 'status'>) => !DONE.has(incident.status);

export function tabCounts(incidents: Pick<IncidentSummary, 'status'>[]) {
  const open = incidents.filter(isOpen).length;
  return { open, closed: incidents.length - open, all: incidents.length };
}

// Lifecycle order for the Status sort: earliest phase first, so untouched work leads.
const STATUS_ORDER: IncidentSummary['status'][] = [
  'NEW',
  'CLASSIFIED',
  'ASSIGNED',
  'REOPENED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'PENDING_INFO',
  'RESOLVED',
  'VERIFIED',
  'CLOSED',
];
const rank = (priority: IncidentSummary['priority']) => (priority ? Number(priority[1]) : 9);

export function sortIncidents<T extends Pick<IncidentSummary, 'createdAt' | 'priority' | 'status'>>(
  incidents: T[],
  sort: QueueSort,
) {
  const newest = (a: T, b: T) => b.createdAt.localeCompare(a.createdAt);
  const compare: Record<QueueSort, (a: T, b: T) => number> = {
    newest,
    oldest: (a, b) => -newest(a, b),
    priority: (a, b) => rank(a.priority) - rank(b.priority) || newest(a, b),
    status: (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || newest(a, b),
  };
  return [...incidents].sort(compare[sort]);
}

/** Tab and escalation filtering happen on the client; status, priority, assignee and q go to the API. */
export function filterIncidents<T extends Pick<IncidentSummary, 'status' | 'escalationLevel'>>(
  incidents: T[],
  tab: QueueTab,
  escalation: Escalation | null,
) {
  return incidents.filter(
    (incident) =>
      (tab === 'all' || (tab === 'open') === isOpen(incident)) &&
      (!escalation || incident.escalationLevel === escalation),
  );
}

export function queueSearch(filters: {
  q?: string;
  status?: string | null;
  priority?: string | null;
  assigneeId?: string | null;
}) {
  const params = new URLSearchParams({ limit: '200' });
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
  return params.toString();
}

/** Elapsed time since assignment while still unacknowledged: `m:ss` under 1 hour, else `1h 5m`. */
export function formatUnacknowledged(assignedAt: string, now: Date): string {
  const start = Date.parse(assignedAt);
  if (!Number.isFinite(start)) return '0:00';
  const totalSeconds = Math.max(0, Math.floor((now.getTime() - start) / 1000));
  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export interface EscalationChipStyle {
  level: 1 | 2 | 3;
  className: string;
}

/** Progressive visual weight for escalation chips in the staff queue. */
export function escalationChipStyle(level: Escalation): EscalationChipStyle | null {
  switch (level) {
    case 'TEAM_LEAD':
      return { level: 1, className: 'bg-high-subtle text-high-foreground' };
    case 'SYS_ADMIN':
      return {
        level: 2,
        className: 'bg-high-subtle text-high-foreground ring-1 ring-inset ring-high',
      };
    case 'IT_MANAGER':
      return { level: 3, className: 'bg-critical-subtle text-critical-foreground' };
    case 'TECHNICIAN':
      return null;
  }
}
