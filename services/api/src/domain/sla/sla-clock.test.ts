import { describe, expect, it } from 'vitest';
import { InvalidInputException } from '../exceptions/index.js';
import { Duration, FixedClock, Instant } from '../shared/index.js';
import { SlaClock, SlaKind, SlaTarget } from './index.js';

const start = Instant.fromIso('2026-11-03T09:00:00.000Z');
const target = SlaTarget.of(Duration.ofMinutes(5), Duration.ofMinutes(30));
const at = (minutes: number): Instant => start.plus(Duration.ofMinutes(minutes));
const clock = (): SlaClock => new SlaClock(start, target, 0.75);
const kinds = [SlaKind.RESPONSE, SlaKind.RESOLUTION];

describe('SlaClock status rules', () => {
  describe.each(kinds)('%s boundaries', (kind) => {
    const window = kind === SlaKind.RESPONSE ? 5 : 30;
    it.each([
      ['oneMillisecondBeforeWarningIsOnTrack', window * 60_000 * 0.75 - 1, 'ON_TRACK'],
      ['exactWarningPointIsAtRisk', window * 60_000 * 0.75, 'AT_RISK'],
      ['exactDeadlineIsNotBreached', window * 60_000, 'AT_RISK'],
      ['oneMillisecondAfterDeadlineIsBreached', window * 60_000 + 1, 'BREACHED'],
    ] as const)('%s', (_rule, elapsed, expected) => {
      const time = new FixedClock(start);
      time.advance(Duration.ofMs(elapsed));
      expect(clock().status(kind, time.now())).toBe(expected);
    });
    it.each([
      [-1, 'MET'],
      [0, 'MET'],
      [1, 'BREACHED'],
    ] as const)('completionAtDeadlineOffset%sHasStatus%s', (offset, expected) => {
      const sla = clock();
      const completion = Instant.of(at(window).ms + offset);
      if (kind === SlaKind.RESPONSE) sla.recordResponse(completion);
      else sla.recordResolution(completion);
      expect(sla.status(kind, at(100))).toBe(expected);
    });
  });
  it('recordResponseKeepsOnlyTheFirstAcknowledgement', () => {
    const sla = clock();
    sla.recordResponse(at(4));
    sla.recordResponse(at(6));
    expect(sla.status('RESPONSE', at(100))).toBe('MET');
    expect(sla.toSnapshot().respondedAt).toBe(at(4).toIso());
  });
  it.each([0, 1, -0.1, 1.1, NaN, Infinity])('rejectsInvalidClockWarningRatio %s', (ratio) => {
    expect(() => new SlaClock(start, target, ratio)).toThrow(InvalidInputException);
  });
  it('roundsFractionalWarningPointsUpToTheFirstEligibleMillisecond', () => {
    const sla = new SlaClock(start, SlaTarget.of(Duration.ofMs(3), Duration.ofMs(7)), 0.75);
    expect(sla.warningAt('RESPONSE').ms - start.ms).toBe(3);
    expect(sla.warningAt('RESOLUTION').ms - start.ms).toBe(6);
  });
});

describe('SlaClock pause and reopen rules', () => {
  it('pauseExtendsOnlyResolutionDeadlineByThePausedDuration', () => {
    const sla = clock();
    sla.pause(at(10));
    expect(sla.resolutionDeadline(at(20))).toEqual(at(40));
    expect(sla.resolutionDeadline()).toEqual(at(30));
    expect(sla.responseDeadline()).toEqual(at(5));
    expect(sla.status('RESOLUTION', at(100))).toBe('PAUSED');
    expect(sla.status('RESPONSE', at(100))).toBe('BREACHED');
    sla.resume(at(20));
    expect(sla.resolutionDeadline()).toEqual(at(40));
    expect(sla.responseDeadline()).toEqual(at(5));
    expect(sla.warningAt('RESOLUTION')).toEqual(at(32.5));
    expect(sla.warningAt('RESPONSE')).toEqual(at(3.75));
    expect(sla.status('RESOLUTION', at(40))).toBe('AT_RISK');
    expect(sla.status('RESOLUTION', Instant.of(at(40).ms + 1))).toBe('BREACHED');
  });
  it('multiplePausesAccumulateWithoutCountingActiveWork', () => {
    const sla = clock();
    sla.pause(at(5));
    sla.resume(at(10));
    sla.pause(at(15));
    sla.resume(at(25));
    expect(sla.resolutionDeadline()).toEqual(at(45));
    expect(sla.toSnapshot().pausedTotal).toBe(Duration.ofMinutes(15).ms);
  });
  it('reopenAddsVerificationWaitToPausedTotalAndClearsCompletion', () => {
    const sla = clock();
    sla.pause(at(5));
    sla.resume(at(10));
    sla.recordResolution(at(25));
    expect(sla.status('RESOLUTION', at(50))).toBe('MET');
    sla.clearResolution(at(40));
    expect(sla.toSnapshot()).toMatchObject({ resolvedAt: null, pausedTotal: 20 * 60_000 });
    expect(sla.resolutionDeadline()).toEqual(at(50));
    expect(sla.status('RESOLUTION', at(40))).toBe('ON_TRACK');
    sla.recordResolution(at(49));
    expect(sla.status('RESOLUTION', at(100))).toBe('MET');
  });
  it('clearingAbsentResolutionDoesNotAddPauseTime', () => {
    const sla = clock();
    sla.clearResolution(at(40));
    expect(sla.toSnapshot().pausedTotal).toBe(0);
  });
  it('rejectsDoublePauseWithoutChangingTheClock', () => {
    const sla = clock();
    sla.pause(at(10));
    const before = sla.toSnapshot();
    expect(() => sla.pause(at(20))).toThrow(InvalidInputException);
    expect(sla.toSnapshot()).toEqual(before);
  });
  it('rejectsResumeWithoutPauseAndDoubleResume', () => {
    const sla = clock();
    expect(() => sla.resume(at(10))).toThrow(InvalidInputException);
    sla.pause(at(10));
    sla.resume(at(20));
    const before = sla.toSnapshot();
    expect(() => sla.resume(at(25))).toThrow(InvalidInputException);
    expect(sla.toSnapshot()).toEqual(before);
  });
  it('rejectsResumeBeforePauseWithoutChangingTheClock', () => {
    const sla = clock();
    sla.pause(at(10));
    const before = sla.toSnapshot();
    expect(() => sla.resume(at(9))).toThrow(InvalidInputException);
    expect(sla.toSnapshot()).toEqual(before);
  });
  it('rejectsReopenBeforeResolutionWithoutChangingTheClock', () => {
    const sla = clock();
    sla.recordResolution(at(20));
    const before = sla.toSnapshot();
    expect(() => sla.clearResolution(at(19))).toThrow(InvalidInputException);
    expect(sla.toSnapshot()).toEqual(before);
  });
  it('retargetPreservesStartCompletionAndAccumulatedAndCurrentPauses', () => {
    const sla = clock();
    sla.recordResponse(at(4));
    sla.pause(at(5));
    sla.resume(at(10));
    sla.pause(at(15));
    sla.retarget(SlaTarget.of(Duration.ofMinutes(10), Duration.ofMinutes(60)), 0.5);
    expect(sla.responseDeadline()).toEqual(at(10));
    expect(sla.resolutionDeadline(at(20))).toEqual(at(70));
    expect(sla.warningAt('RESOLUTION')).toEqual(at(35));
    expect(sla.status('RESPONSE', at(100))).toBe('MET');
    expect(sla.toSnapshot()).toMatchObject({
      startedAt: start.toIso(),
      pausedSince: at(15).toIso(),
      pausedTotal: 5 * 60_000,
    });
  });
  it('rejectsInvalidRetargetRatioWithoutChangingTheClock', () => {
    const sla = clock();
    const before = sla.toSnapshot();
    expect(() =>
      sla.retarget(SlaTarget.of(Duration.ofMinutes(1), Duration.ofMinutes(2)), 1),
    ).toThrow(InvalidInputException);
    expect(sla.toSnapshot()).toEqual(before);
  });
});

describe('SlaClock monitoring rules', () => {
  it('checksOnlyNewWarningsAndBreachesForBothKinds', () => {
    const sla = clock();
    expect(sla.check(at(0))).toEqual([]);
    expect(sla.check(at(3.75))).toEqual([{ kind: 'RESPONSE', what: 'WARNING' }]);
    expect(sla.check(at(3.75))).toEqual([]);
    expect(sla.check(at(5))).toEqual([]);
    expect(sla.check(Instant.of(at(5).ms + 1))).toEqual([{ kind: 'RESPONSE', what: 'BREACH' }]);
    expect(sla.check(at(6))).toEqual([]);
    expect(sla.check(at(22.5))).toEqual([{ kind: 'RESOLUTION', what: 'WARNING' }]);
    expect(sla.check(at(22.5))).toEqual([]);
    expect(sla.check(at(30))).toEqual([]);
    expect(sla.check(Instant.of(at(30).ms + 1))).toEqual([{ kind: 'RESOLUTION', what: 'BREACH' }]);
    expect(sla.check(at(60))).toEqual([]);
  });
  it('breachImpliesWarningWithoutEmittingAWarningAfterBreach', () => {
    const sla = clock();
    expect(sla.check(at(31))).toEqual([
      { kind: 'RESPONSE', what: 'BREACH' },
      { kind: 'RESOLUTION', what: 'BREACH' },
    ]);
    expect(sla.toSnapshot().warned).toEqual(kinds);
    expect(sla.check(at(31))).toEqual([]);
    sla.retarget(SlaTarget.of(Duration.ofMinutes(40), Duration.ofMinutes(40)), 0.75);
    expect(sla.check(at(31))).toEqual([]);
  });
  it('completedOnTimeClocksNeverRaiseWarningsOrBreaches', () => {
    const sla = clock();
    sla.recordResponse(at(4));
    sla.recordResolution(at(29));
    expect(sla.check(at(100))).toEqual([]);
    expect(sla.overall(at(100))).toBe('MET');
  });
  it('lateCompletionsStillRaiseBreaches', () => {
    const sla = clock();
    sla.recordResponse(at(6));
    sla.recordResolution(at(31));
    expect(sla.check(at(100))).toEqual([
      { kind: 'RESPONSE', what: 'BREACH' },
      { kind: 'RESOLUTION', what: 'BREACH' },
    ]);
  });
  it('resolutionDoesNotWarnWhilePausedButResponseKeepsRunning', () => {
    const sla = clock();
    sla.pause(at(1));
    expect(sla.check(at(40))).toEqual([{ kind: 'RESPONSE', what: 'BREACH' }]);
    sla.resume(at(41));
    expect(sla.check(at(62.5))).toEqual([{ kind: 'RESOLUTION', what: 'WARNING' }]);
  });
  it('recordedResolutionBreachRemainsBreachedWhilePaused', () => {
    const sla = clock();
    sla.check(at(31));
    sla.pause(at(32));
    expect(sla.status('RESOLUTION', at(100))).toBe('BREACHED');
    expect(sla.check(at(100))).toEqual([]);
  });
  it('overallUsesBreachThenRiskThenPausedThenOnTrackThenMet', () => {
    const sla = clock();
    expect(sla.overall(at(0))).toBe('ON_TRACK');
    sla.pause(at(1));
    expect(sla.overall(at(2))).toBe('PAUSED');
    expect(sla.overall(at(4))).toBe('AT_RISK');
    expect(sla.overall(at(6))).toBe('BREACHED');
    sla.recordResponse(at(4));
    expect(sla.overall(at(6))).toBe('PAUSED');
    sla.resume(at(7));
    expect(sla.overall(at(7))).toBe('ON_TRACK');
    expect(sla.overall(at(29))).toBe('AT_RISK');
    sla.recordResolution(at(30));
    expect(sla.overall(at(100))).toBe('MET');
  });
  it('statusAndOverallDoNotConsumeCrossings', () => {
    const sla = clock();
    const before = sla.toSnapshot();
    sla.status('RESPONSE', at(6));
    sla.overall(at(31));
    expect(sla.toSnapshot()).toEqual(before);
    expect(sla.check(at(6))).toEqual([{ kind: 'RESPONSE', what: 'BREACH' }]);
  });
  it('snapshotRoundTripPreservesPausesCompletionsAndCrossingIdempotence', () => {
    const sla = clock();
    sla.check(at(3.75));
    sla.recordResponse(at(4));
    sla.pause(at(10));
    sla.resume(at(20));
    sla.pause(at(25));
    const data = JSON.parse(JSON.stringify(sla.toSnapshot())) as ReturnType<SlaClock['toSnapshot']>;
    const restored = SlaClock.rehydrate(data);
    expect(restored.toSnapshot()).toEqual(sla.toSnapshot());
    expect(restored.check(at(30))).toEqual([]);
    restored.resume(at(35));
    restored.check(at(41));
    restored.recordResolution(at(45));
    const completed = SlaClock.rehydrate(restored.toSnapshot());
    expect(completed.toSnapshot()).toEqual(restored.toSnapshot());
    expect(completed.overall(at(100))).toBe('MET');
  });
  it('rehydratedBreachesAreNotEmittedAgain', () => {
    const sla = clock();
    sla.check(at(31));
    expect(SlaClock.rehydrate(sla.toSnapshot()).check(at(100))).toEqual([]);
  });
  it('snapshotArraysAndTargetsAreDetachedFromBothClocks', () => {
    const sla = clock();
    sla.check(at(31));
    const data = sla.toSnapshot();
    const restored = SlaClock.rehydrate(data);
    Reflect.set(data.warned, 'length', 0);
    Reflect.set(data.breached, 'length', 0);
    Reflect.set(data.target, 'response', 999);
    expect(sla.toSnapshot().breached).toEqual(kinds);
    expect(restored.toSnapshot()).toEqual(sla.toSnapshot());
  });
});

describe('SlaClock diagnostics and restored crossings', () => {
  it('identifiesInvalidPauseAndResumeStates', () => {
    const sla = clock();
    expect(() => sla.resume(at(1))).toThrow(InvalidInputException);
    expect(() => sla.resume(at(1))).toThrow(/not paused/i);
    sla.pause(at(1));
    expect(() => sla.pause(at(2))).toThrow(InvalidInputException);
    expect(() => sla.pause(at(2))).toThrow(/already paused/i);
  });
  it('marksRestoredBreachesAsAlreadyWarned', () => {
    const snapshot = { ...clock().toSnapshot(), warned: [], breached: [SlaKind.RESPONSE] };
    expect(SlaClock.rehydrate(snapshot).toSnapshot().warned).toEqual([SlaKind.RESPONSE]);
  });
});
