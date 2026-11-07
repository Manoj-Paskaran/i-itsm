import { expect, it } from 'vitest';
import {
  auditCategory,
  auditDateRange,
  auditTimeBand,
  collapseSystemRuns,
  filterAuditEntries,
  validateAuditFilters,
  type AuditEntry,
} from './audit-ledger';
const id = '01a1b42a-e701-7595-b06b-ab31fbab6d2c';
const event: AuditEntry & { narrative: string } = {
  at: '2026-11-07T04:00:00.100Z',
  actor: null,
  action: 'SlaWarningRaised',
  incident: { id, number: 'INC0215' },
  fromStatus: null,
  toStatus: null,
  description: 'SLA warning',
  narrative: 'Response SLA at risk',
};
it.each([
  ['IncidentCreated', 'Lifecycle'],
  ['IncidentAssigned', 'Assignment'],
  ['SlaWarningRaised', 'SLA warning'],
  ['SlaBreached', 'SLA breach'],
  ['IncidentEscalated', 'Escalation'],
  ['StrategyChanged', 'Configuration'],
  ['NoteAdded', 'Activity'],
])('categorizesAuditEventsByTheirMeaning_%s', (action, category) => {
  expect(auditCategory(action)).toBe(category);
});
it('validatesShareableFiltersAndIgnoresUnknownSearchKeys', () => {
  expect(
    validateAuditFilters({
      incidentId: id,
      actor: 'people',
      priority: 'P1',
      preset: '24h',
      q: 'risk',
      category: 'SLA warning',
      extra: 'discard',
    }),
  ).toEqual({
    incidentId: id,
    actor: 'people',
    priority: 'P1',
    preset: '24h',
    q: 'risk',
    category: 'SLA warning',
  });
  expect(
    validateAuditFilters({
      incidentId: 'bad',
      actor: 'bad',
      category: 'bad',
      priority: 'P9',
      preset: 'bad',
      from: 'yesterday',
    }),
  ).toEqual({});
});
it('distinguishesCalendarTodayFromRollingDatePresets', () => {
  const now = new Date('2026-11-07T10:30:00Z');
  expect(auditDateRange({ preset: '24h' }, now)).toEqual({
    from: '2026-11-06T10:30:00.000Z',
    to: now.toISOString(),
  });
  expect(auditDateRange({ preset: '7d' }, now).from).toBe('2026-10-31T10:30:00.000Z');
  expect(new Date(auditDateRange({ preset: 'today' }, now).from!).getHours()).toBe(0);
  expect(auditDateRange({ from: '2026-11-01', to: '2026-11-07' }, now)).toEqual({
    from: '2026-11-01',
    to: '2026-11-07',
  });
});
it('filtersPeopleSystemCategoryNarrativeAndCurrentIncidentMetadata', () => {
  const person = {
    ...event,
    actor: { id: 'person', name: 'Farah Ali' },
    action: 'IncidentResolved',
    narrative: 'Resolved by Farah Ali',
  };
  const metadata = new Map([
    [id, { priority: 'P1' as const, service: { id: 'service', name: 'Payment', criticality: 4 } }],
  ]);
  expect(filterAuditEntries([event, person], { actor: 'people', q: 'FARAH' }, metadata)).toEqual([
    person,
  ]);
  expect(
    filterAuditEntries([event, person], { actor: 'system', category: 'SLA warning' }, metadata),
  ).toEqual([event]);
  expect(filterAuditEntries([event, person], { actor: 'person' }, metadata)).toEqual([person]);
  expect(filterAuditEntries([event], { priority: 'P1', service: 'service' }, metadata)).toEqual([
    event,
  ]);
  expect(filterAuditEntries([event], { priority: 'P2' }, metadata)).toEqual([]);
  expect(filterAuditEntries([event], { service: 'unknown' }, metadata)).toEqual([]);
});
it('collapsesOnlyConsecutiveIdenticalSystemEventsWithinTheSameSecond', () => {
  const other = {
    ...event,
    at: '2026-11-07T04:00:00.900Z',
    incident: { id: 'other', number: 'INC0205' },
  };
  const person = { ...event, actor: { id: 'p', name: 'Person' } };
  const later = { ...event, at: '2026-11-07T04:00:01.000Z' };
  expect(collapseSystemRuns([event, other, person, event, later]).map((run) => run.length)).toEqual(
    [2, 1, 1, 1],
  );
  expect(
    collapseSystemRuns([event, { ...event, narrative: 'Resolution SLA at risk' }]),
  ).toHaveLength(2);
  expect(collapseSystemRuns([event, { ...event, action: 'SlaBreached' }])).toHaveLength(2);
});
it('groupsEventsUnderLocalDayAndTimeBandHeaders', () => {
  expect(auditTimeBand(new Date(2026, 10, 7, 9).toISOString())).toContain('Morning');
  expect(auditTimeBand(new Date(2026, 10, 7, 19).toISOString())).toContain('Evening');
});
