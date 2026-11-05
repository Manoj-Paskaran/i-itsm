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
/** SLA monitor rows: not-closed incidents (the set the SLA report counts) that are breached or at risk, breached first, then most escalated. */
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
        Number(b.slaStatus === 'BREACHED') - Number(a.slaStatus === 'BREACHED') ||
        LEVEL_RANK[b.escalationLevel] - LEVEL_RANK[a.escalationLevel] ||
        a.createdAt.localeCompare(b.createdAt),
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
