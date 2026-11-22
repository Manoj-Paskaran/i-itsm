import { describe, expect, it } from 'vitest';
import { EscalationLevel } from '../escalation/escalation-level.js';
import { at, later, snapshot } from '../incidents/test-fixtures.js';
import { Duration } from '../shared/index.js';
import { SlaRiskPolicy, type SlaRiskFactors } from './sla-risk-policy.js';

const base: SlaRiskFactors = {
  priority: 'P3',
  elapsedFraction: 0.5,
  minutesOpen: 60,
  minutesToDeadline: 60,
  paused: false,
  escalationLevel: EscalationLevel.TECHNICIAN,
  unassigned: false,
};
const policy = new SlaRiskPolicy();

describe('SlaRiskPolicy', () => {
  it('hasNoRiskWithoutAnSla', () =>
    expect(SlaRiskPolicy.factors(snapshot('NEW'), later)).toBeNull());
  it.each(['RESOLVED', 'VERIFIED', 'CLOSED'] as const)('hasNoRiskOnce %s', (status) =>
    expect(SlaRiskPolicy.factors(snapshot(status), later)).toBeNull(),
  );
  it('measuresElapsedShareOfTheResolutionWindow', () => {
    const f = SlaRiskPolicy.factors(snapshot('ASSIGNED'), later)!;
    expect(f).toMatchObject({
      priority: 'P2',
      elapsedFraction: 0.5,
      minutesOpen: 60,
      paused: false,
    });
    expect(f.minutesToDeadline).toBe(60);
  });
  it('measuresPastTheDeadlineAsMoreThanTheWholeWindow', () => {
    const f = SlaRiskPolicy.factors(snapshot('ASSIGNED'), at.plus(Duration.ofHours(3)))!;
    expect(f).toMatchObject({ elapsedFraction: 1.5, minutesToDeadline: -60 });
  });
  it('excludesPausedTimeFromTheElapsedShare', () => {
    const f = SlaRiskPolicy.factors(snapshot('PENDING_INFO'), at.plus(Duration.ofHours(1)))!;
    expect(f).toMatchObject({ paused: true, elapsedFraction: 0 });
  });
  it.each([
    ['P1', 0.65],
    ['P2', 0.6],
    ['P3', 0.55],
    ['P4', 0.5],
  ] as const)('startsFromElapsedShareAndAddsTheWeightOf %s', (priority, probability) =>
    expect(policy.estimate({ ...base, priority }).probability).toBe(probability),
  );
  it('explainsOnlyTightPrioritiesAsAReason', () => {
    expect(policy.estimate({ ...base, priority: 'P1' }).reasons).toContain('P1 has a tight window');
    expect(policy.estimate(base)).toEqual({
      probability: 0.55,
      level: 'MEDIUM',
      reasons: ['50% of the resolution window used'],
    });
  });
  it.each([
    [EscalationLevel.TECHNICIAN, 0],
    [EscalationLevel.TEAM_LEAD, 0.1],
    [EscalationLevel.SYS_ADMIN, 0.2],
    [EscalationLevel.IT_MANAGER, 0.3],
  ] as const)('returnsEscalationWeightPerLevel (%s)', (level, weight) =>
    expect(SlaRiskPolicy.escalationWeight(level)).toBe(weight),
  );
  it.each([
    [EscalationLevel.TECHNICIAN, 0.55],
    [EscalationLevel.TEAM_LEAD, 0.65],
    [EscalationLevel.SYS_ADMIN, 0.75],
    [EscalationLevel.IT_MANAGER, 0.85],
  ] as const)('weightsRiskByEscalationLevel (%s)', (escalationLevel, probability) =>
    expect(policy.estimate({ ...base, escalationLevel }).probability).toBe(probability),
  );
  it.each([
    [EscalationLevel.TEAM_LEAD, 'escalated to team lead'],
    [EscalationLevel.SYS_ADMIN, 'escalated to system admin'],
    [EscalationLevel.IT_MANAGER, 'escalated to IT manager'],
  ] as const)('namesTheEscalationLevelInTheReasons (%s)', (escalationLevel, reason) =>
    expect(policy.estimate({ ...base, escalationLevel }).reasons).toEqual([
      '50% of the resolution window used',
      reason,
    ]),
  );
  it('addsWeightForNoAssignee', () =>
    expect(policy.estimate({ ...base, unassigned: true })).toEqual({
      probability: 0.65,
      level: 'MEDIUM',
      reasons: ['50% of the resolution window used', 'nobody assigned yet'],
    }));
  it('crossesIntoHighWhenEscalatedAndUnassigned', () =>
    expect(
      policy.estimate({ ...base, escalationLevel: EscalationLevel.TEAM_LEAD, unassigned: true }),
    ).toMatchObject({ probability: 0.75, level: 'HIGH' }));
  it('halvesRiskWhileTheClockIsPaused', () =>
    expect(policy.estimate({ ...base, paused: true })).toMatchObject({
      probability: 0.28,
      reasons: ['50% of the resolution window used', 'clock paused while waiting for information'],
    }));
  it('flagsAnIncidentNobodyIsAssignedTo', () => {
    expect(SlaRiskPolicy.factors(snapshot('CLASSIFIED'), later)!.unassigned).toBe(true);
    expect(SlaRiskPolicy.factors(snapshot('ASSIGNED'), later)!.unassigned).toBe(false);
  });
  it('addsNoPriorityWeightWhenUnprioritised', () =>
    expect(policy.estimate({ ...base, priority: null }).probability).toBe(0.5));
  it.each([1, 1.2])('isCertainOnceTheDeadlineIsReached (elapsed %s)', (elapsedFraction) =>
    expect(policy.estimate({ ...base, elapsedFraction })).toEqual({
      probability: 1,
      level: 'HIGH',
      reasons: ['resolution deadline already passed'],
    }),
  );
  it('staysCertainPastTheDeadlineEvenWhilePaused', () =>
    expect(policy.estimate({ ...base, elapsedFraction: 1.2, paused: true })).toMatchObject({
      probability: 1,
      level: 'HIGH',
    }));
  it('keepsProbabilityBetweenOneAndNinetyNinePercent', () => {
    expect(policy.estimate({ ...base, priority: 'P4', elapsedFraction: 0 }).probability).toBe(0.01);
    expect(policy.estimate({ ...base, priority: 'P1', elapsedFraction: 0.95 }).probability).toBe(
      0.99,
    );
  });
  it.each([
    [0.39, 'LOW'],
    [0.4, 'MEDIUM'],
    [0.69, 'MEDIUM'],
    [0.7, 'HIGH'],
  ] as const)('mapsProbability %s to level %s', (p, level) =>
    expect(SlaRiskPolicy.levelOf(p)).toBe(level),
  );
});
