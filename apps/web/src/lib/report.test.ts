import { describe, expect, it } from 'vitest';
import { homeLabel, reportErrors } from './report';

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
