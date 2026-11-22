import { describe, expect, it } from 'vitest';
import {
  duplicateCandidates,
  formatScore,
  navItems,
  slaOnTrackPriority,
  slaWatchlist,
} from './staff';

const labels = (role: string, permissions: string[]) =>
  navItems({ role, permissions } as never).map((i) => i.label);
const row = (
  id: string,
  slaStatus: string | null,
  escalationLevel = 'TECHNICIAN',
  status = 'IN_PROGRESS',
  service = 's1',
  priority: string | null = 'P2',
  createdAt = `2026-11-04T10:0${id}:00Z`,
) =>
  ({
    id,
    priority,
    slaStatus,
    escalationLevel,
    status,
    service: { id: service },
    createdAt,
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
  it('watchesNotClosedBreachedOrAtRiskIncidentsLatestReportedFirst', () =>
    expect(
      slaWatchlist([
        row('1', 'AT_RISK', 'TECHNICIAN', 'IN_PROGRESS', 's1', 'P1', '2026-11-04T10:05:00Z'),
        row('2', 'BREACHED', 'TEAM_LEAD', 'IN_PROGRESS', 's1', 'P2', '2026-11-04T10:02:00Z'),
        row('3', 'ON_TRACK'),
        row('4', 'BREACHED', 'IT_MANAGER', 'IN_PROGRESS', 's1', 'P2', '2026-11-04T10:02:00Z'),
        row('5', 'BREACHED', 'TECHNICIAN', 'CLOSED'),
      ]).map((i: { id: string }) => i.id),
    ).toEqual(['1', '4', '2']));
  it('alsoWatchesOnTrackIncidentsPredictedHighRisk', () =>
    expect(
      slaWatchlist([row('1', 'ON_TRACK'), row('2', 'ON_TRACK')], new Set(['2'])).map(
        (i: { id: string }) => i.id,
      ),
    ).toEqual(['2']));
  it('listsOpenOnTrackP1AndP2Separately', () => {
    const items = [
      row('1', 'ON_TRACK', 'TECHNICIAN', 'IN_PROGRESS', 's1', 'P2'),
      row('2', 'PAUSED', 'TECHNICIAN', 'PENDING_INFO', 's1', 'P1'),
      row('3', 'ON_TRACK', 'TEAM_LEAD', 'IN_PROGRESS', 's1', 'P1'),
      row('4', 'ON_TRACK', 'TECHNICIAN', 'IN_PROGRESS', 's1', 'P3'),
      row('5', 'ON_TRACK', 'TECHNICIAN', 'RESOLVED', 's1', 'P1'),
      row('6', 'ON_TRACK', 'TECHNICIAN', 'VERIFIED', 's1', 'P1'),
      row('7', 'ON_TRACK', 'TECHNICIAN', 'CLOSED', 's1', 'P2'),
      row('8', 'BREACHED', 'IT_MANAGER', 'IN_PROGRESS', 's1', 'P1'),
      row('9', 'AT_RISK', 'TECHNICIAN', 'IN_PROGRESS', 's1', 'P2'),
    ];
    expect(slaOnTrackPriority(items).map((i: { id: string }) => i.id)).toEqual(['3', '2', '1']);
  });
  it('excludesPredictedHighRiskIncidentsFromOnTrackPriorityList', () =>
    expect(
      slaOnTrackPriority(
        [
          row('1', 'ON_TRACK', 'TECHNICIAN', 'IN_PROGRESS', 's1', 'P1'),
          row('2', 'PAUSED', 'TECHNICIAN', 'PENDING_INFO', 's1', 'P2'),
        ],
        new Set(['1']),
      ).map((i: { id: string }) => i.id),
    ).toEqual(['2']));
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
