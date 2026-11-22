import type { AuthUser, IncidentSummary } from '@itsm/contracts';
import { homeLabel } from './report';

type Perm = AuthUser['permissions'][number];
export interface NavItem {
  to: '/' | '/report' | '/monitor' | '/reports' | '/audit' | '/admin';
  label: string;
}

/** Each role sees a different sidebar; every item is gated by the permission its API needs. */
export function navItems(user: Pick<AuthUser, 'role' | 'permissions'> | null): NavItem[] {
  if (!user) return [];
  const has = (p: Perm) => user.permissions.includes(p);
  const items: NavItem[] = [{ to: '/', label: homeLabel(user) }];
  if (user.role === 'EMPLOYEE') items.push({ to: '/report', label: 'Report a problem' });
  if (has('INCIDENT_VIEW_ALL')) items.push({ to: '/monitor', label: 'SLA monitor' });
  if (has('REPORTS_VIEW')) items.push({ to: '/reports', label: 'Reports' });
  if (has('AUDIT_VIEW')) items.push({ to: '/audit', label: 'Audit' });
  if (has('CONFIG_MANAGE')) items.push({ to: '/admin', label: 'Configuration' });
  return items;
}

const LEVEL_RANK = { TECHNICIAN: 0, TEAM_LEAD: 1, SYS_ADMIN: 2, IT_MANAGER: 3 };
const PRIORITY_RANK = { P1: 0, P2: 1 } as const;
const SETTLED_STATUSES: ReadonlySet<IncidentSummary['status']> = new Set([
  'RESOLVED',
  'VERIFIED',
  'CLOSED',
]);

/** SLA monitor rows: not-closed incidents (the set the SLA report counts) that are breached or at risk, latest reported first. */
export function slaWatchlist<
  T extends Pick<IncidentSummary, 'id' | 'slaStatus' | 'escalationLevel' | 'createdAt' | 'status'>,
>(incidents: T[], predictedHigh: ReadonlySet<string> = new Set()) {
  // IF-E early warning: an on-track incident the risk estimate calls HIGH is watched too.
  return incidents
    .filter(
      (i) =>
        (i.slaStatus === 'BREACHED' || i.slaStatus === 'AT_RISK' || predictedHigh.has(i.id)) &&
        i.status !== 'CLOSED',
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) ||
        Number(b.slaStatus === 'BREACHED') - Number(a.slaStatus === 'BREACHED') ||
        LEVEL_RANK[b.escalationLevel] - LEVEL_RANK[a.escalationLevel],
    );
}

/** Open (not resolved/verified/closed) P1 and P2 incidents whose SLA is on track or paused and not already on the attention watchlist, latest reported first. */
export function slaOnTrackPriority<
  T extends Pick<
    IncidentSummary,
    'id' | 'priority' | 'slaStatus' | 'escalationLevel' | 'createdAt' | 'status'
  >,
>(incidents: T[], predictedHigh: ReadonlySet<string> = new Set()) {
  return incidents
    .filter(
      (i): i is T & { priority: 'P1' | 'P2' } =>
        !SETTLED_STATUSES.has(i.status) &&
        (i.priority === 'P1' || i.priority === 'P2') &&
        (i.slaStatus === 'ON_TRACK' || i.slaStatus === 'PAUSED') &&
        !predictedHigh.has(i.id),
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        LEVEL_RANK[b.escalationLevel] - LEVEL_RANK[a.escalationLevel],
    );
}

/** Candidates to merge into: other open incidents on the same service. */
export function duplicateCandidates<
  T extends Pick<IncidentSummary, 'id' | 'status' | 'service' | 'createdAt'>,
>(incident: Pick<IncidentSummary, 'id' | 'service'>, incidents: T[]) {
  return incidents
    .filter(
      (i) =>
        i.id !== incident.id &&
        i.service.id === incident.service.id &&
        !['CLOSED', 'VERIFIED'].includes(i.status),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const formatScore = (score: number) => `${Math.round(score * 100)}%`;
