import { describe, expect, it } from 'vitest';
import { duplicateCandidates, formatScore, navItems, slaWatchlist } from './staff';

const labels = (role: string, permissions: string[]) =>
  navItems({ role, permissions } as never).map((i) => i.label);
const row = (
  id: string,
  slaStatus: string | null,
  escalationLevel = 'TECHNICIAN',
  status = 'IN_PROGRESS',
  service = 's1',
) =>
  ({
    id,
    slaStatus,
    escalationLevel,
    status,
    service: { id: service },
    createdAt: `2026-11-04T10:0${id}:00Z`,
  }) as never;

describe('staff screens', () => {
  it('givesEachRoleItsOwnNavigation', () => {
    expect(labels('EMPLOYEE', [])).toEqual(['My incidents', 'Report a problem']);
    expect(labels('TECHNICIAN', [])).toEqual(['My work']);
    expect(labels('TEAM_LEAD', ['INCIDENT_VIEW_ALL', 'REPORTS_VIEW'])).toEqual([
      'All incidents',
      'SLA monitor',
      'Reports',
    ]);
    expect(labels('ADMIN', ['INCIDENT_VIEW_ALL', 'AUDIT_VIEW', 'CONFIG_MANAGE'])).toEqual([
      'All incidents',
      'SLA monitor',
      'Audit',
      'Configuration',
    ]);
  });
  it('watchesNotClosedBreachedOrAtRiskIncidentsBreachedFirstThenMostEscalated', () =>
    expect(
      slaWatchlist([
        row('1', 'AT_RISK', 'IT_MANAGER'),
        row('2', 'BREACHED', 'TEAM_LEAD'),
        row('3', 'ON_TRACK'),
        row('4', 'BREACHED', 'IT_MANAGER'),
        row('5', 'BREACHED', 'TECHNICIAN', 'CLOSED'),
      ]).map((i: { id: string }) => i.id),
    ).toEqual(['4', '2', '1']));
  it('offersOnlyOtherOpenIncidentsOnTheSameServiceAsDuplicateTargets', () =>
    expect(
      duplicateCandidates({ id: '1', service: { id: 's1' } } as never, [
        row('1', null),
        row('2', null, 'TECHNICIAN', 'ASSIGNED'),
        row('3', null, 'TECHNICIAN', 'CLOSED'),
        row('4', null, 'TECHNICIAN', 'NEW', 's2'),
      ]).map((i: { id: string }) => i.id),
    ).toEqual(['2']));
  it('showsRecommendationScoresAsPercentages', () => expect(formatScore(0.874)).toBe('87%'));
});
