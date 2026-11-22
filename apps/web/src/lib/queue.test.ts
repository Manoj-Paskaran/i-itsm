import { describe, expect, it } from 'vitest';
import {
  escalationChipStyle,
  filterIncidents,
  formatUnacknowledged,
  queueSearch,
  sortIncidents,
  tabCounts,
} from './queue';

const row = (
  status: string,
  priority: string | null,
  createdAt: string,
  escalationLevel = 'TECHNICIAN',
) => ({ status, priority, createdAt, escalationLevel }) as never;
const rows = [
  row('IN_PROGRESS', 'P3', '2026-11-04T10:00:00Z'),
  row('CLOSED', 'P1', '2026-11-04T09:00:00Z'),
  row('ASSIGNED', 'P1', '2026-11-04T11:00:00Z', 'TEAM_LEAD'),
  row('VERIFIED', null, '2026-11-04T08:00:00Z'),
];
const ids = (list: { createdAt: string }[]) => list.map((r) => r.createdAt.slice(11, 13));

describe('incident queue', () => {
  it('countsVerifiedAndClosedAsClosedAndTheRestAsOpen', () =>
    expect(tabCounts(rows)).toEqual({ open: 2, closed: 2, all: 4 }));
  it('showsOnlyOpenIncidentsOnTheOpenTab', () =>
    expect(ids(filterIncidents(rows, 'open', null))).toEqual(['10', '11']));
  it('filtersEscalationLevelOnTheClient', () =>
    expect(ids(filterIncidents(rows, 'all', 'TEAM_LEAD'))).toEqual(['11']));
  it('sortsNewestFirstByDefault', () =>
    expect(ids(sortIncidents(rows, 'newest'))).toEqual(['11', '10', '09', '08']));
  it('sortsByPriorityWithUnprioritisedLastAndNewestBreakingTies', () =>
    expect(ids(sortIncidents(rows, 'priority'))).toEqual(['11', '09', '10', '08']));
  it('sortsByLifecycleOrderForStatus', () =>
    expect(ids(sortIncidents(rows, 'status'))).toEqual(['11', '10', '08', '09']));
  it('sendsOnlySetFiltersToTheApiWithTheMaximumPage', () =>
    expect(queueSearch({ q: ' gateway ', status: null, priority: 'P1' })).toBe(
      'limit=200&q=gateway&priority=P1',
    ));
  it('countsTabsAfterTheEscalationFilter', () =>
    expect(tabCounts(filterIncidents(rows, 'all', 'TEAM_LEAD'))).toEqual({
      open: 1,
      closed: 0,
      all: 1,
    }));
  it('formatsUnacknowledgedTimeAsMinutesAndSeconds', () => {
    const start = '2026-11-04T10:00:00Z';
    expect(formatUnacknowledged(start, new Date('2026-11-04T09:59:55Z'))).toBe('0:00');
    expect(formatUnacknowledged(start, new Date('2026-11-04T10:00:05Z'))).toBe('0:05');
    expect(formatUnacknowledged(start, new Date('2026-11-04T10:00:38Z'))).toBe('0:38');
    expect(formatUnacknowledged(start, new Date('2026-11-04T10:01:02Z'))).toBe('1:02');
    expect(formatUnacknowledged(start, new Date('2026-11-04T10:59:59Z'))).toBe('59:59');
  });
  it('formatsUnacknowledgedTimeOverOneHourAsHoursAndMinutes', () => {
    const start = '2026-11-04T10:00:00Z';
    expect(formatUnacknowledged(start, new Date('2026-11-04T11:00:00Z'))).toBe('1h 0m');
    expect(formatUnacknowledged(start, new Date('2026-11-04T11:05:45Z'))).toBe('1h 5m');
    expect(formatUnacknowledged(start, new Date('2026-11-04T12:30:00Z'))).toBe('2h 30m');
  });
  it('mapsEscalationLevelsToProgressiveChipStylesAndPips', () => {
    expect(escalationChipStyle('TECHNICIAN')).toBeNull();
    expect(escalationChipStyle('TEAM_LEAD')).toEqual({
      level: 1,
      className: 'bg-high-subtle text-high-foreground',
    });
    expect(escalationChipStyle('SYS_ADMIN')).toEqual({
      level: 2,
      className: 'bg-high-subtle text-high-foreground ring-1 ring-inset ring-high',
    });
    expect(escalationChipStyle('IT_MANAGER')).toEqual({
      level: 3,
      className: 'bg-critical-subtle text-critical-foreground',
    });
  });
});
