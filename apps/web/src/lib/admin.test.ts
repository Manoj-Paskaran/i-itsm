import { describe, expect, it } from 'vitest';
import { auditSearch, labelIds, strategyLabel } from './admin';

describe('admin screens', () => {
  it('readsStrategyIdsAsWords', () =>
    expect(strategyLabel('impact-urgency-matrix')).toBe('Impact urgency matrix'));
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
