import { describe, expect, it } from 'vitest';
import type { IncidentDetail } from '@itsm/contracts';
import { formatClock, formatDuration, roadmap, type AuditEntry } from './roadmap';

const now = new Date('2026-11-04T10:30:00Z');
const base = {
  status: 'ASSIGNED',
  slaStatus: 'ON_TRACK',
  createdAt: '2026-11-04T10:00:00Z',
  slaDeadlines: { response: '2026-11-04T10:15:00Z', resolution: '2026-11-04T14:00:00Z' },
  assignee: { id: 'f', name: 'Farah Ali' },
  reporter: { id: 'p', name: 'Priya Sharma' },
  closure: null,
} as unknown as IncidentDetail;
const entry = (
  to: IncidentDetail['status'],
  at: string,
  from: IncidentDetail['status'] | null = null,
) => ({ at, fromStatus: from, toStatus: to }) satisfies AuditEntry;
const trail: AuditEntry[] = [
  entry('NEW', '2026-11-04T10:00:00Z'),
  entry('ASSIGNED', '2026-11-04T10:01:00Z', 'CLASSIFIED'),
  entry('ACKNOWLEDGED', '2026-11-04T10:10:00Z', 'ASSIGNED'),
  entry('IN_PROGRESS', '2026-11-04T10:12:00Z', 'ACKNOWLEDGED'),
  entry('RESOLVED', '2026-11-04T10:25:00Z', 'IN_PROGRESS'),
];
const step = (detail: Partial<IncidentDetail>, label: string, audit = trail) =>
  roadmap({ ...base, ...detail }, audit, now).find((s) => s.label === label)!;

describe('lifecycle roadmap', () => {
  it('marksTheStepAfterTheCurrentStatusAsActive', () =>
    expect(roadmap(base, trail, now).map((s) => s.state)).toEqual([
      'reached',
      'reached',
      'active',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]));
  it('timesReportedFromCreatedAt', () =>
    expect(step({}, 'Reported').reachedAt?.toISOString()).toBe('2026-11-04T10:00:00.000Z'));
  it('timesReachedStepsFromTheAuditEntryThatEnteredThatStatus', () =>
    expect(step({ status: 'IN_PROGRESS' }, 'Acknowledged').reachedAt?.toISOString()).toBe(
      '2026-11-04T10:10:00.000Z',
    ));
  it('givesUpcomingStepsNoTime', () => expect(step({}, 'Resolved').reachedAt).toBeNull());
  it('saysWhoMustAcknowledgeWhileAssigned', () =>
    expect(step({}, 'Acknowledged').phase?.text).toBe('Acknowledging · waiting for\u00a0Farah'));
  it('saysWhoMustStartWorkWhileAcknowledged', () =>
    expect(step({ status: 'ACKNOWLEDGED' }, 'In progress').phase?.text).toBe(
      'Starting work · waiting for\u00a0Farah',
    ));
  it('showsResolvingWhileInProgress', () =>
    expect(step({ status: 'IN_PROGRESS' }, 'Resolved').phase?.text).toBe(
      'Resolving · with\u00a0Farah',
    ));
  it('marksResolvedReachedAndVerifiedActiveWhileAwaitingConfirmation', () => {
    expect(step({ status: 'RESOLVED' }, 'Resolved').state).toBe('reached');
    expect(step({ status: 'RESOLVED' }, 'Verified')).toMatchObject({
      state: 'active',
      phase: { text: 'Confirming fix · waiting for\u00a0Priya', tone: 'primary' },
    });
  });
  it('showsClosingOnceVerified', () =>
    expect(step({ status: 'VERIFIED' }, 'Closed').phase?.text).toBe('Closing'));
  it('keepsInProgressReachedAndWarnsWhileWaitingForInfo', () => {
    expect(step({ status: 'PENDING_INFO' }, 'In progress').state).toBe('reached');
    expect(step({ status: 'PENDING_INFO' }, 'Resolved').phase).toEqual({
      text: 'Waiting for info from\u00a0Priya',
      tone: 'warning',
    });
  });
  it('makesInProgressActiveAgainAfterReopen', () =>
    expect(step({ status: 'REOPENED' }, 'In progress').state).toBe('active'));
  it('keepsTheReopenedAssigneeWithTheWaitingPreposition', () =>
    expect(step({ status: 'REOPENED' }, 'In progress').phase?.text).toBe(
      'Reopened · waiting for\u00a0Farah',
    ));
  it('countsDownToTheResponseDeadlineBeforeAcknowledge', () => {
    const sla = step({}, 'Acknowledged', trail.slice(0, 2)).sla;
    expect(sla?.text).toMatch(/^Response due .+ · 15m overdue$/);
    expect(sla?.tone).toBe('critical');
  });
  it('reportsResponseMetWhenAcknowledgedBeforeTheDeadline', () =>
    expect(step({ status: 'IN_PROGRESS' }, 'Acknowledged').sla).toMatchObject({
      text: 'Response met',
      tone: 'success',
    }));
  it('reportsHowLateTheResolutionWas', () =>
    expect(
      step(
        {
          status: 'RESOLVED',
          slaDeadlines: {
            response: base.slaDeadlines!.response,
            resolution: '2026-11-04T10:20:00Z',
          },
        },
        'Resolved',
      ).sla,
    ).toMatchObject({ text: 'Resolution late by 5m', tone: 'critical' }));
  it('pausesTheResolutionCountdownWhileWaitingForInfo', () =>
    expect(step({ status: 'PENDING_INFO' }, 'Resolved').sla?.text).toMatch(/ · paused$/));
  it('turnsTheCountingTargetAmberWhenTheApiSaysAtRisk', () =>
    expect(
      step(
        {
          status: 'IN_PROGRESS',
          slaStatus: 'AT_RISK',
          slaDeadlines: {
            response: base.slaDeadlines!.response,
            resolution: '2026-11-04T10:35:00Z',
          },
        },
        'Resolved',
      ).sla?.tone,
    ).toBe('warning'));
  it('reachesBothStepsWithoutSlaNotesForADuplicate', () =>
    expect(
      roadmap(
        {
          ...base,
          status: 'CLOSED',
          closure: {
            reason: 'DUPLICATE',
            closedBy: null,
            at: now.toISOString(),
            duplicateOf: null,
          },
        },
        trail,
        now,
      ).map((s) => [s.label, s.state, s.sla]),
    ).toEqual([
      ['Reported', 'reached', null],
      ['Closed', 'reached', null],
    ]));
  it('formatsDurationsInDaysPastADay', () => expect(formatDuration(26 * 3600000)).toBe('1d 2h'));
  it('keepsOtherDayDatesAndTimesTogether', () =>
    expect(formatClock(new Date(2026, 10, 7, 22, 18), new Date(2026, 10, 6, 22, 0))).toBe(
      '7\u00a0Nov,\u00a022:18',
    ));
  it('formatsSameDayClocksWithoutADate', () =>
    expect(formatClock(new Date(2026, 10, 6, 22, 18), new Date(2026, 10, 6, 22, 0))).toBe('22:18'));
  it('keepsResponseMetAfterAReassignSendsTheIncidentBackToAssigned', () =>
    expect(step({ status: 'ASSIGNED' }, 'Acknowledged').sla?.text).toBe('Response met'));
  it('keepsTheWorkStartTimeAfterAnInfoRequestIsAnswered', () =>
    expect(
      step({ status: 'IN_PROGRESS' }, 'In progress', [
        ...trail.slice(0, 4),
        entry('PENDING_INFO', '2026-11-04T10:15:00Z', 'IN_PROGRESS'),
        entry('IN_PROGRESS', '2026-11-04T10:20:00Z', 'PENDING_INFO'),
      ]).reachedAt?.toISOString(),
    ).toBe('2026-11-04T10:12:00.000Z'));
  it('namesTheOriginalUnderClosedForADuplicate', () =>
    expect(
      step(
        {
          status: 'CLOSED',
          closure: {
            reason: 'DUPLICATE',
            closedBy: null,
            at: now.toISOString(),
            duplicateOf: { id: 'x', number: 'INC0042' },
          },
        },
        'Closed',
      ).note,
    ).toBe('Duplicate of INC0042'));
  it('tellsTheReporterTheFixIsWaitingForThem', () =>
    expect(roadmap({ ...base, status: 'RESOLVED' }, trail, now, 'p')[5]?.phase?.text).toBe(
      'Confirming fix · waiting for\u00a0you',
    ));
  it('asksTheReporterForTheirAnswerWhileWaitingForInfo', () =>
    expect(roadmap({ ...base, status: 'PENDING_INFO' }, trail, now, 'p')[4]?.phase?.text).toBe(
      'Waiting for your answer',
    ));
  it('staysMutedWhenTheApiSaysOnTrackEvenCloseToTheDeadline', () =>
    expect(
      step(
        {
          status: 'IN_PROGRESS',
          slaDeadlines: {
            response: base.slaDeadlines!.response,
            resolution: '2026-11-04T10:35:00Z',
          },
        },
        'Resolved',
      ).sla?.tone,
    ).toBe('muted'));
  it('keepsShowingABreachWhilePaused', () =>
    expect(
      step(
        {
          status: 'PENDING_INFO',
          slaDeadlines: {
            response: base.slaDeadlines!.response,
            resolution: '2026-11-04T10:20:00Z',
          },
        },
        'Resolved',
      ).sla,
    ).toMatchObject({
      text: expect.stringMatching(/10m overdue · paused$/) as string,
      tone: 'critical',
    }));
  it('retimesAssignedAfterAReassignment', () =>
    expect(
      step({ status: 'ASSIGNED' }, 'Assigned', [
        ...trail.slice(0, 2),
        {
          at: '2026-11-04T10:20:00Z',
          action: 'IncidentAssigned',
          fromStatus: 'ASSIGNED',
          toStatus: 'ASSIGNED',
        },
      ]).reachedAt?.toISOString(),
    ).toBe('2026-11-04T10:20:00.000Z'));
  it('saysClassifyingForANewIncident', () =>
    expect(step({ status: 'NEW' }, 'Assigned').phase?.text).toBe('Classifying'));
});
