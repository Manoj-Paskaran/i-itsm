import { describe, expect, it } from 'vitest';
import { InvalidInputException } from '../exceptions/index.js';
import { SlaBreached, SlaWarningRaised } from '../events/index.js';
import { Duration, Instant, Priority } from '../shared/index.js';
import { SlaTarget } from '../sla/index.js';
import { Incident } from './incident.js';
import {
  assignee,
  at,
  category,
  duplicateId,
  reporter,
  reportProps,
  system,
  technician,
} from './test-fixtures.js';

const p1 = {
  target: SlaTarget.of(Duration.ofMinutes(5), Duration.ofMinutes(30)),
  warningRatio: 0.75,
};
const p2 = {
  target: SlaTarget.of(Duration.ofMinutes(15), Duration.ofHours(2)),
  warningRatio: 0.5,
};
const time = (minutes: number): Instant => at.plus(Duration.ofMinutes(minutes));
function classified(): Incident {
  const incident = Incident.report(reportProps);
  incident.classify(category, Priority.P1, p1, system, time(1));
  incident.pullEvents();
  return incident;
}
function working(): Incident {
  const incident = classified();
  incident.assign(technician, 0, system, time(2));
  incident.acknowledge(assignee, time(4));
  incident.startWork(assignee, time(4));
  incident.pullEvents();
  return incident;
}

describe('Incident SLA rules', () => {
  it('unclassifiedIncidentHasNoClockAndMonitoringDoesNothing', () => {
    const incident = Incident.report(reportProps);
    incident.pullEvents();
    incident.checkSla(time(100));
    expect(incident.slaStatus(time(100))).toBeNull();
    expect(incident.slaDeadlines(time(100))).toBeNull();
    expect(incident.toSnapshot().slaClock).toBeNull();
    expect(incident.pullEvents()).toEqual([]);
  });
  it('classificationStartsClockAtReportTime', () => {
    const incident = classified();
    expect(incident.slaDeadlines(time(1))).toEqual({ response: time(5), resolution: time(30) });
    expect(incident.slaStatus(time(1))).toBe('ON_TRACK');
    expect(incident.toSnapshot().slaClock?.startedAt).toBe(at.toIso());
  });
  it('checkAtThreeMinutesFortyFiveSecondsRaisesResponseWarningOnlyOnce', () => {
    const incident = classified();
    incident.checkSla(Instant.of(time(3.75).ms - 1));
    expect(incident.pullEvents()).toEqual([]);
    incident.checkSla(time(3.75));
    incident.checkSla(time(3.75));
    const events = incident.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(SlaWarningRaised);
    expect(events[0]).toMatchObject({
      type: 'SlaWarningRaised',
      kind: 'RESPONSE',
      deadline: time(5),
      actorId: null,
      incidentId: incident.id,
      occurredAt: time(3.75),
      fromStatus: null,
      toStatus: null,
    });
    expect(Object.isFrozen(events[0])).toBe(true);
    expect(events[0]?.describe()).toBe(
      `Incident ${incident.id} RESPONSE SLA approaching deadline ${time(5).toIso()}.`,
    );
  });
  it('checkAtFiveMinutesOneSecondRaisesResponseBreachOnlyOnce', () => {
    const incident = classified();
    incident.checkSla(time(3.75));
    incident.pullEvents();
    incident.checkSla(time(5));
    expect(incident.pullEvents()).toEqual([]);
    const now = time(5).plus(Duration.ofSeconds(1));
    incident.checkSla(now);
    incident.checkSla(now);
    const events = incident.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(SlaBreached);
    expect(events[0]).toMatchObject({
      type: 'SlaBreached',
      kind: 'RESPONSE',
      deadline: time(5),
      occurredAt: now,
      actorId: null,
      fromStatus: null,
      toStatus: null,
    });
    expect(events[0]?.describe()).toBe(
      `Incident ${incident.id} RESPONSE SLA breached deadline ${time(5).toIso()}.`,
    );
    expect(Object.isFrozen(events[0])).toBe(true);
    expect(incident.slaStatus(now)).toBe('BREACHED');
  });
  it('acknowledgementAtFourMinutesMeetsResponseSla', () => {
    const incident = working();
    expect(incident.toSnapshot().slaClock?.respondedAt).toBe(time(4).toIso());
    incident.checkSla(time(6));
    expect(incident.pullEvents()).toEqual([]);
    expect(incident.slaStatus(time(6))).toBe('ON_TRACK');
    incident.resolve('Router fixed', undefined, assignee, time(29));
    expect(incident.slaStatus(time(100))).toBe('MET');
  });
  it('waitingForInfoFromTenToTwentyMinutesMovesResolutionDeadlineToForty', () => {
    const incident = working();
    incident.requestInfo('Which office?', assignee, time(10));
    expect(incident.slaStatus(time(20))).toBe('PAUSED');
    expect(incident.slaDeadlines(time(20))).toEqual({ response: time(5), resolution: time(40) });
    incident.provideInfo('Office A', reporter, time(20));
    expect(incident.slaDeadlines(time(25))).toEqual({ response: time(5), resolution: time(40) });
    expect(incident.toSnapshot().slaClock?.pausedTotal).toBe(Duration.ofMinutes(10).ms);
  });
  it('resolutionWarningsAndBreachesUseTheExtendedDeadline', () => {
    const incident = working();
    incident.requestInfo('Which office?', assignee, time(10));
    incident.provideInfo('Office A', reporter, time(20));
    incident.pullEvents();
    incident.checkSla(time(32.5));
    incident.checkSla(time(32.5));
    expect(incident.pullEvents()).toMatchObject([
      { type: 'SlaWarningRaised', kind: 'RESOLUTION', deadline: time(40) },
    ]);
    incident.checkSla(Instant.of(time(40).ms + 1));
    incident.checkSla(Instant.of(time(40).ms + 1));
    expect(incident.pullEvents()).toMatchObject([
      { type: 'SlaBreached', kind: 'RESOLUTION', deadline: time(40) },
    ]);
  });
  it('rejectionExcludesVerificationWaitFromResolutionWindow', () => {
    const incident = working();
    incident.resolve('Router fixed', undefined, assignee, time(25));
    incident.reject('Still broken', reporter, time(40));
    expect(incident.slaDeadlines(time(40))?.resolution).toEqual(time(45));
    expect(incident.toSnapshot().slaClock).toMatchObject({
      resolvedAt: null,
      pausedTotal: Duration.ofMinutes(15).ms,
    });
    incident.startWork(assignee, time(40));
    incident.resolve('Router replaced', undefined, assignee, time(44));
    expect(incident.slaStatus(time(100))).toBe('MET');
  });
  it('reprioritisationKeepsOriginalStartAndResolutionPauses', () => {
    const incident = working();
    incident.requestInfo('Which office?', assignee, time(10));
    incident.provideInfo('Office A', reporter, time(20));
    incident.requestInfo('Which floor?', assignee, time(25));
    incident.reprioritise(Priority.P2, p2, system, time(30));
    expect(incident.slaDeadlines(time(30))).toEqual({ response: time(15), resolution: time(135) });
    expect(incident.toSnapshot().slaClock).toMatchObject({
      startedAt: at.toIso(),
      warningRatio: 0.5,
      respondedAt: time(4).toIso(),
      pausedSince: time(25).toIso(),
      pausedTotal: Duration.ofMinutes(10).ms,
    });
  });
  it('closedIncidentDoesNotCheckOrConsumeCrossings', () => {
    const incident = classified();
    incident.closeAsDuplicate(duplicateId, system, time(2));
    incident.pullEvents();
    const before = incident.toSnapshot();
    incident.checkSla(time(100));
    expect(incident.pullEvents()).toEqual([]);
    expect(incident.toSnapshot()).toEqual(before);
  });
  it('closedDuplicateHasNoSlaStatusOrDeadlines', () => {
    const incident = classified();
    incident.closeAsDuplicate(duplicateId, system, time(2));
    expect(incident.slaStatus(time(6))).toBeNull();
    expect(incident.slaDeadlines(time(6))).toBeNull();
  });
  it('samePriorityRetargetsSuppliedTermsWithoutRecordingPriorityChange', () => {
    const incident = classified();
    incident.reprioritise(Priority.P1, { ...p1, warningRatio: 0.5 }, system, time(2));
    expect(incident.pullEvents()).toEqual([]);
    incident.checkSla(time(2.5));
    expect(incident.pullEvents()).toMatchObject([
      { type: 'SlaWarningRaised', kind: 'RESPONSE', deadline: time(5) },
    ]);
    expect(incident.toSnapshot().slaClock?.startedAt).toBe(at.toIso());
  });
  it('samePriorityStillRejectsInvalidSlaTerms', () => {
    const incident = classified();
    const before = incident.toSnapshot();
    expect(() =>
      incident.reprioritise(Priority.P1, { ...p1, warningRatio: 1 }, system, time(2)),
    ).toThrow(InvalidInputException);
    expect(incident.toSnapshot()).toEqual(before);
    expect(incident.pullEvents()).toEqual([]);
  });
  it('restoredIncidentKeepsPendingPauseAndPreviouslyEmittedCrossings', () => {
    const incident = working();
    incident.checkSla(time(22.5));
    incident.requestInfo('Which office?', assignee, time(23));
    const restored = Incident.rehydrate(incident.toSnapshot());
    expect(restored.pullEvents()).toEqual([]);
    expect(restored.toSnapshot()).toEqual(incident.toSnapshot());
    restored.provideInfo('Office A', reporter, time(33));
    restored.pullEvents();
    restored.checkSla(time(35));
    expect(restored.pullEvents()).toEqual([]);
    restored.checkSla(time(41));
    expect(restored.pullEvents()).toMatchObject([
      { type: 'SlaBreached', kind: 'RESOLUTION', deadline: time(40) },
    ]);
    const breached = Incident.rehydrate(restored.toSnapshot());
    breached.checkSla(time(50));
    expect(breached.pullEvents()).toEqual([]);
  });
  it('invalidClassificationTermsLeaveIncidentAndEventsUnchanged', () => {
    const incident = Incident.report(reportProps);
    incident.pullEvents();
    const before = incident.toSnapshot();
    expect(() =>
      incident.classify(category, Priority.P1, { ...p1, warningRatio: 1 }, system, time(1)),
    ).toThrow(InvalidInputException);
    expect(incident.toSnapshot()).toEqual(before);
    expect(incident.pullEvents()).toEqual([]);
  });
  it('invalidReprioritisationTermsLeaveIncidentAndEventsUnchanged', () => {
    const incident = classified();
    const before = incident.toSnapshot();
    expect(() =>
      incident.reprioritise(Priority.P2, { ...p2, warningRatio: 0 }, system, time(2)),
    ).toThrow(InvalidInputException);
    expect(incident.toSnapshot()).toEqual(before);
    expect(incident.pullEvents()).toEqual([]);
  });
  it('invalidResumeTimeLeavesIncidentConversationAndClockUnchanged', () => {
    const incident = working();
    incident.requestInfo('Which office?', assignee, time(10));
    incident.pullEvents();
    const before = incident.toSnapshot();
    expect(() => incident.provideInfo('Office A', reporter, time(9))).toThrow(
      InvalidInputException,
    );
    expect(incident.toSnapshot()).toEqual(before);
    expect(incident.pullEvents()).toEqual([]);
  });
  it('invalidReopenTimeLeavesIncidentAndClockUnchanged', () => {
    const incident = working();
    incident.resolve('Router fixed', undefined, assignee, time(20));
    incident.pullEvents();
    const before = incident.toSnapshot();
    expect(() => incident.reject('Still broken', reporter, time(19))).toThrow(
      InvalidInputException,
    );
    expect(incident.toSnapshot()).toEqual(before);
    expect(incident.pullEvents()).toEqual([]);
  });
});
