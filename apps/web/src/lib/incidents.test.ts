import { describe, expect, it } from 'vitest';
import type { IncidentDetail } from '@itsm/contracts';
import {
  humanizeAudit,
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
    ).toBe('Reported by Priya Sharma for service Payment Gateway.'));
  it('rendersSlaDeadlinesAsClockTimes', () =>
    expect(
      humanizeAudit(
        'Incident INC0216 RESPONSE SLA breached deadline 2026-11-03T17:43:35.186Z.',
        'INC0216',
      ),
    ).toMatch(/^Response SLA breached deadline \d{2}:\d{2}\.$/));
  it('dropsIncidentNumberFromTimelineText', () =>
    expect(humanizeAudit('Work started on incident INC0216.', 'INC0216')).toBe('Work started.'));
  it('tellsTechnicianWhoTheyAreWaitingFor', () =>
    expect(
      waitingCopy({
        ...detail,
        status: 'RESOLVED',
        allowedActions: [],
        reporter: { id: 'x', name: 'Priya Sharma' },
      }),
    ).toBe('Waiting for Priya Sharma to confirm the fix.'));
  it('pointsStaffToTheSidePanelWhenTheyCanOnlyReassign', () =>
    expect(
      waitingCopy({
        ...detail,
        status: 'ASSIGNED',
        allowedActions: ['assign', 'addNote'],
        reporter: { id: 'p', name: 'Priya' },
      }),
    ).toBe('Reassign or close it as a duplicate from the side panel.'));
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
    ).toBe('P1 unacknowledged for 49 s (threshold 40 s) → System admin'));
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
