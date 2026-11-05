import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { duplicateOf, homeLabel, reportErrors } from './report';

const valid = {
  title: 'Checkout fails',
  description: 'Every card payment times out.',
  serviceId: 'svc',
  impact: 4,
  urgency: 4,
  affectedUsers: '8000',
};

describe('report form', () => {
  it('acceptsACompleteReport', () => expect(reportErrors(valid)).toEqual({}));
  it('requiresImpactAndUrgencyAnswers', () =>
    expect(Object.keys(reportErrors({ ...valid, impact: null, urgency: null }))).toEqual([
      'impact',
      'urgency',
    ]));
  it('rejectsADescriptionUnderTenCharacters', () =>
    expect(reportErrors({ ...valid, description: 'broken' }).description).toBeDefined());
  it('rejectsZeroOrFractionalAffectedUsers', () => {
    expect(reportErrors({ ...valid, affectedUsers: '0' }).affectedUsers).toBeDefined();
    expect(reportErrors({ ...valid, affectedUsers: '2.5' }).affectedUsers).toBeDefined();
  });
  it('namesTheHomeListByRole', () =>
    expect([
      homeLabel({ role: 'EMPLOYEE', permissions: [] }),
      homeLabel({ role: 'TECHNICIAN', permissions: [] }),
      homeLabel({ role: 'TEAM_LEAD', permissions: ['INCIDENT_VIEW_ALL'] }),
    ]).toEqual(['My incidents', 'My work', 'All incidents']));
});

describe('duplicate report', () => {
  const error = (code: string, details: Record<string, unknown>) =>
    new ApiError(409, code, 'You already reported this problem', details);
  it('linksADuplicateRejectionToTheEarlierIncident', () =>
    expect(
      duplicateOf(
        error('DUPLICATE_INCIDENT', { existingIncidentId: 'id-1', existingNumber: 'INC0217' }),
      ),
    ).toEqual({ id: 'id-1', number: 'INC0217' }));
  it('stillLinksWhenTheNumberIsMissing', () =>
    expect(duplicateOf(error('DUPLICATE_INCIDENT', { existingIncidentId: 'id-1' }))).toEqual({
      id: 'id-1',
      number: null,
    }));
  it('ignoresOtherErrors', () => {
    expect(duplicateOf(error('SERVICE_NOT_FOUND', { existingIncidentId: 'id-1' }))).toBeNull();
    expect(duplicateOf(new Error('offline'))).toBeNull();
  });
});
