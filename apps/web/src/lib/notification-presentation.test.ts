import { expect, it } from 'vitest';
import { notificationKind, notificationText } from './notification-presentation';
it.each([
  ['SlaBreached', 'breach'],
  ['SlaWarningRaised', 'warning'],
  ['IncidentAssigned', 'assignment'],
  ['IncidentEscalated', 'escalation'],
  ['InfoRequested', 'request'],
  ['IncidentResolved', 'resolved'],
  ['Unknown', 'update'],
])('givesEachNotificationTypeItsOwnMeaning_%s', (event, kind) => {
  expect(notificationKind(event)).toBe(kind);
});
it('usesAtRiskWordingAndHumanEscalationLevels', () => {
  expect(notificationText('SLA approaching on INC0215')).toBe('SLA at risk on INC0215');
  expect(notificationText('INC0215 escalated to It Manager')).toBe(
    'INC0215 escalated to IT manager',
  );
});

it('groupsAdjacentIncidentUpdatesWithoutChangingChronologyOrGroupingGeneralNotices', async () => {
  const { notificationRuns } = await import('./notification-presentation');
  const a = { incident: { id: 'a' } },
    b = { incident: { id: 'b' } },
    general = { incident: null };
  expect(notificationRuns([a, a, b, a, general, general]).map((run) => run.length)).toEqual([
    2, 1, 1, 1, 1,
  ]);
});
