import { describe, expect, it } from 'vitest';
import { auditActionLabel, auditSearch, labelIds, strategyLabel } from './admin';

describe('admin screens', () => {
  it('readsStrategyIdsAsWords', () =>
    expect(strategyLabel('impact-urgency-matrix')).toBe('Impact urgency matrix'));
  it.each([
    ['SlaWarningRaised', 'SLA warning raised'],
    ['SlaBreached', 'SLA breached'],
    ['SLAWarningRaised', 'SLA warning raised'],
    ['IncidentEscalated', 'Incident escalated'],
    ['WorkStarted', 'Work started'],
  ])('formatsAuditAction%sInSentenceCaseWithAcronyms', (action, expected) => {
    expect(auditActionLabel(action)).toBe(expected);
  });
  it('sendsOnlyChosenAuditFiltersAsTheLocalDaysBounds', () => {
    const q = new URLSearchParams(
      auditSearch({ action: 'IncidentEscalated', from: '2026-11-04', to: '2026-11-04' }),
    );
    expect(q.get('action')).toBe('IncidentEscalated');
    expect(q.get('from')).toBe(new Date('2026-11-04T00:00:00').toISOString());
    expect(q.get('to')).toBe(new Date('2026-11-04T23:59:59.999').toISOString());
    expect(new URLSearchParams(auditSearch({})).has('from')).toBe(false);
  });
  it('replacesKnownIdsWithNamesInAuditText', () =>
    expect(
      labelIds(
        'Assigned to 00000000-0000-4000-8000-000000000019 and 11111111-1111-4111-8111-111111111111.',
        new Map([['00000000-0000-4000-8000-000000000019', 'Farah Ali']]),
      ),
    ).toBe('Assigned to Farah Ali and 11111111-1111-4111-8111-111111111111.'));
});

it('sendsIncidentAndSpecificActorFiltersToTheAuditApi', () => {
  const params = new URLSearchParams(
    auditSearch({
      incidentId: 'incident-id',
      actorId: 'actor-id',
      from: '2026-11-07T00:00:00.000Z',
    }),
  );
  expect(params.get('incidentId')).toBe('incident-id');
  expect(params.get('actorId')).toBe('actor-id');
  expect(params.get('from')).toBe('2026-11-07T00:00:00.000Z');
  expect(params.get('limit')).toBe('200');
  expect(new URLSearchParams(auditSearch({})).has('actorId')).toBe(false);
});
