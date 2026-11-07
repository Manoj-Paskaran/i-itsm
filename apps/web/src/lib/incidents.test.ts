import { describe, expect, it } from 'vitest';
import type { IncidentDetail } from '@itsm/contracts';
import {
  humanizeAudit,
  humanizeLevels,
  formatAssignmentReason,
  formatRationale,
  lifecycleTrack,
  waitingCopy,
  lifecycleStep,
  primaryAction,
  secondaryActions,
  statusGroup,
  activityEvents,
  activityTone,
} from './incidents';
const detail = {
  status: 'ACKNOWLEDGED',
  slaStatus: 'PAUSED',
  slaDeadlines: { response: '2026-11-03T10:00:00Z', resolution: '2026-11-03T11:00:00Z' },
} as IncidentDetail;
describe('incident rules', () => {
  it('mapsPendingInfoToInProgressStep', () => expect(lifecycleStep('PENDING_INFO')).toBe(3));
  it('prefersAcknowledgeAsPrimaryAction', () =>
    expect(primaryAction(['resolve', 'acknowledge'])).toBe('acknowledge'));
  it('neverRendersAddNoteAsButton', () => {
    expect(primaryAction(['addNote'])).toBeNull();
    expect(secondaryActions(['addNote'])).toEqual([]);
  });
  it('humanizesAuditDescriptionsForTheTimeline', () =>
    expect(
      humanizeAudit(
        'Incident INC0216 reported by Priya Sharma (EMPLOYEE) for service Payment Gateway.',
        'INC0216',
      ),
    ).toBe('Reported by Priya Sharma for service Payment Gateway'));
  it('humanizesEscalationLevelsInNotificationText', () => {
    for (const [level, label] of [
      ['It Manager', 'IT manager'],
      ['IT Manager', 'IT manager'],
      ['Team Lead', 'Team lead'],
      ['Sys Admin', 'System admin'],
      ['System Administrator', 'System admin'],
    ]) {
      expect(humanizeLevels(`INC0216 escalated to ${level}`)).toBe(`INC0216 escalated to ${label}`);
      expect(humanizeLevels(`P1 unacknowledged → ${level}.`)).toBe(`P1 unacknowledged → ${label}.`);
      expect(humanizeAudit(`Incident INC0216 escalated to ${level}.`, 'INC0216')).toBe(
        `Escalated to ${label}`,
      );
    }
  });
  it('preservesTextOutsideEscalationLevels', () => {
    for (const text of [
      'Team Lead reported the incident',
      'Assigned to IT Managerial Support',
      'Escalated to IT manager → System admin',
      'No notifications yet.',
      '',
    ])
      expect(humanizeLevels(text)).toBe(text);
  });
  it.each(['', '.'])('humanizesResolvedClosureAudit (%s)', (ending) =>
    expect(humanizeAudit(`Incident INC0216 closed: RESOLVED${ending}`, 'INC0216')).toBe('Closed'),
  );
  it.each(['', '.'])('humanizesDuplicateClosureAudit (%s)', (ending) =>
    expect(humanizeAudit(`Incident INC0216 closed: DUPLICATE of INC0214${ending}`, 'INC0216')).toBe(
      'Closed as duplicate of INC0214',
    ),
  );
  it('rendersSlaDeadlinesAsClockTimes', () =>
    expect(
      humanizeAudit(
        'Incident INC0216 RESPONSE SLA breached deadline 2026-11-03T17:43:35.186Z.',
        'INC0216',
      ),
    ).toMatch(/^Response SLA breached \(due \d{2}:\d{2}\)$/));
  it.each(['Response', 'Resolution'])('rewritesBreachedSlaWithItsDueTime (%s)', (target) => {
    for (const ending of ['', '.'])
      expect(humanizeAudit(`${target} SLA breached deadline 22:01${ending}`, 'INC0216')).toBe(
        `${target} SLA breached (due 22:01)`,
      );
  });
  it.each(['Response', 'Resolution'])(
    'rewritesApproachingSlaAsAtRiskWithItsDueTime (%s)',
    (target) => {
      for (const ending of ['', '.'])
        expect(humanizeAudit(`${target} SLA approaching deadline 21:46${ending}`, 'INC0216')).toBe(
          `${target} SLA at risk (due 21:46)`,
        );
    },
  );
  it('removesTrailingPeriodFromActivityCopy', () =>
    expect(humanizeAudit('Closed. No further actions.', 'INC0216')).toBe(
      'Closed. No further actions',
    ));
  it('dropsIncidentNumberFromTimelineText', () =>
    expect(humanizeAudit('Work started on incident INC0216.', 'INC0216')).toBe('Work started'));
  it.each([
    ['APPLICATION', 'Application'],
    ['STORAGE', 'Storage'],
    ['ACCESS_MANAGEMENT', 'Access management'],
  ])('rewritesCategoryAuditInSentenceCase (%s)', (category, label) =>
    expect(humanizeAudit(`Incident INC0216 classified as ${category}.`, 'INC0216')).toBe(
      `Classified as ${label}`,
    ),
  );
  it('rewritesInitialPriorityAuditAsSet', () =>
    expect(humanizeAudit('Priority changed from unassigned to P1.', 'INC0216')).toBe(
      'Priority set to P1',
    ));
  it('keepsExistingPriorityChangesInTheAudit', () =>
    expect(humanizeAudit('Priority changed from P3 to P1.', 'INC0216')).toBe(
      'Priority changed from P3 to P1',
    ));
  it('rewritesEscalationAuditAsPlainSentence', () =>
    expect(
      humanizeAudit('P1 unacknowledged for 68 s (threshold 1 min) → IT Manager', 'INC0216'),
    ).toBe('Escalated to IT manager: P1 unacknowledged for 1m 8s (limit 1m)'));
  it('formatsWholeMinutesInEscalationElapsedTime', () =>
    expect(
      humanizeAudit('P1 unacknowledged for 120 s (threshold 1 min) → IT manager', 'INC0216'),
    ).toBe('Escalated to IT manager: P1 unacknowledged for 2m (limit 1m)'));
  it.each([
    ['48 s', '40 s', '48s', '40s'],
    ['2 min', '1 min', '2m', '1m'],
    ['130 s', '60 s', '2m 10s', '1m'],
    ['1m 8s', '1 min', '1m 8s', '1m'],
  ])(
    'compactsEscalationElapsedAndLimitDurations (%s, %s)',
    (elapsed, limit, compactElapsed, compactLimit) =>
      expect(
        humanizeAudit(
          `P1 unacknowledged for ${elapsed} (threshold ${limit}) → IT Manager`,
          'INC0216',
        ),
      ).toBe(
        `Escalated to IT manager: P1 unacknowledged for ${compactElapsed} (limit ${compactLimit})`,
      ),
  );
  it('tellsTechnicianWhoTheyAreWaitingFor', () =>
    expect(
      waitingCopy({
        ...detail,
        status: 'RESOLVED',
        allowedActions: [],
        reporter: { id: 'x', name: 'Priya Sharma' },
      }),
    ).toBe('Waiting for Priya Sharma to confirm the fix'));
  it('showsTheTechnicianInfoWaitWithoutATrailingPeriod', () =>
    expect(
      waitingCopy({
        ...detail,
        status: 'PENDING_INFO',
        allowedActions: [],
        reporter: { id: 'x', name: 'Arun Pillai' },
      }),
    ).toBe('Waiting for Arun Pillai to answer'));
  it('pointsStaffToTheSidePanelWhenTheyCanOnlyReassign', () =>
    expect(
      waitingCopy({
        ...detail,
        status: 'IN_PROGRESS',
        allowedActions: ['assign', 'addNote'],
        reporter: { id: 'p', name: 'Priya' },
      }),
    ).toBe('Reassign in the side panel'));
  it('rewritesSidePanelHintForBothActions', () =>
    expect(
      waitingCopy({
        ...detail,
        allowedActions: ['assign', 'closeAsDuplicate'],
        reporter: { id: 'p', name: 'Priya' },
      }),
    ).toBe('Reassign or close as duplicate in the side panel'));
  it('onlyMentionsDuplicateWhenItIsTheOnlySidePanelAction', () =>
    expect(
      waitingCopy({
        ...detail,
        allowedActions: ['closeAsDuplicate', 'addNote'],
        reporter: { id: 'p', name: 'Priya' },
      }),
    ).toBe('Close as duplicate in the side panel'));
  it('omitsSidePanelActionsWhenNeitherIsAllowed', () =>
    expect(
      waitingCopy({
        ...detail,
        status: 'IN_PROGRESS',
        allowedActions: ['addNote'],
        reporter: { id: 'p', name: 'Priya' },
      }),
    ).toBe('No actions available to you in this state.'));
  it('showsOnlyReportedAndClosedForDuplicateClosure', () =>
    expect(
      lifecycleTrack({
        ...detail,
        status: 'CLOSED',
        closure: {
          reason: 'DUPLICATE',
          closedBy: null,
          at: '2026-11-03T12:00:00Z',
          duplicateOf: { id: 'x', number: 'INC0001' },
        },
      }),
    ).toEqual({ steps: ['Reported', 'Closed'], current: 1 }));
  it('groupsStatusesIntoActiveWaitingAndDonePills', () =>
    expect(
      (['IN_PROGRESS', 'REOPENED', 'PENDING_INFO', 'RESOLVED', 'VERIFIED', 'CLOSED'] as const).map(
        statusGroup,
      ),
    ).toEqual(['active', 'active', 'waiting', 'waiting', 'done', 'done']));
  it('putsEachPriorityFactorOnItsOwnLine', () =>
    expect(formatRationale('Impact Critical (4) × Urgency Critical (4) = 16')).toBe(
      'Impact Critical (4)\n× Urgency Critical (4) = 16',
    ));
  it('groupsLargeNumbersInRationale', () =>
    expect(formatRationale('Affected users 8000 → ×1.5')).toBe('Affected users 8,000 → ×1.5'));
  it('omitsZeroHistoryFromAssignmentReasons', () =>
    expect(
      formatAssignmentReason('resolved 0 incidents on this service · 4 years experience'),
    ).toBe('4 years experience'));
  it('usesEscalationLabelsInTimeline', () =>
    expect(
      humanizeAudit('P1 unacknowledged for 49 s (threshold 40 s) → System Administrator', 'X'),
    ).toBe('Escalated to System admin: P1 unacknowledged for 49s (limit 40s)'));
  it('colorsActivityIconsByWhatHappened', () =>
    expect(
      ['IncidentAssigned', 'IncidentVerified', 'SlaBreached', 'InfoRequested', 'WorkStarted'].map(
        activityTone,
      ),
    ).toEqual(['active', 'success', 'critical', 'waiting', 'neutral']));
  it('listsActivityNewestFirstWithoutDuplicatingNotes', () =>
    expect(
      activityEvents(
        [
          { at: '2026-11-04T10:00:00Z', action: 'IncidentCreated' },
          { at: '2026-11-04T10:05:00Z', action: 'NoteAdded' },
        ],
        [{ at: '2026-11-04T10:05:00Z' }],
        'newest',
      ).map((e) => e.kind),
    ).toEqual(['note', 'audit']));
  it('tellsTheReporterNothingIsNeededFromThem', () =>
    expect(
      waitingCopy(
        {
          ...detail,
          status: 'IN_PROGRESS',
          allowedActions: [],
          reporter: { id: 'p', name: 'Priya' },
        },
        'p',
      ),
    ).toMatch(/^Nothing needed from you/));
  it('pointsTheReporterToFeedbackOnceClosed', () =>
    expect(
      waitingCopy(
        {
          ...detail,
          status: 'CLOSED',
          allowedActions: ['giveFeedback'],
          reporter: { id: 'p', name: 'Priya' },
        },
        'p',
      ),
    ).toBe('Closed. Tell us how we did below.'));
});

it('namesTheResolverInsteadOfRepeatingTheResolvedState', () => {
  expect(humanizeAudit('Incident INC0215 Resolved: resolved', 'INC0215', 'Farah Ali')).toBe(
    'Resolved by Farah Ali',
  );
  expect(humanizeAudit('Resolved: resolved', 'INC0215')).toBe('Resolved');
  expect(humanizeAudit('Resolved: Restarted payment workers', 'INC0215', 'Farah Ali')).toBe(
    'Resolved: Restarted payment workers',
  );
});
