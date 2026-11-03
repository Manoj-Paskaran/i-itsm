import { describe, expect, it } from 'vitest';
import { Category } from '../catalog/index.js';
import {
  InvalidInputException,
  TechnicianUnavailableException,
  WorkloadExceededException,
} from '../exceptions/index.js';
import { asCategoryId, asIncidentId, asItServiceId, asUserId, Priority } from '../shared/index.js';
import { Availability, Role, Technician } from '../users/index.js';
import {
  AssignmentContext,
  AssignmentStrategyRegistry,
  CompositeAssignmentStrategy,
  ExperienceBasedStrategy,
  LoadBasedStrategy,
  RoundRobinStrategy,
  Recommendation,
  SkillBasedStrategy,
  TechnicianAssigner,
  TechnicianLoad,
} from './index.js';

const service = asItServiceId('payment');
function tech(
  id: string,
  skills: string[],
  capacity: number,
  years: number,
  history: number,
  availability: Availability = Availability.AVAILABLE,
): Technician {
  return Technician.rehydrate({
    id: asUserId(id),
    name: id,
    email: `${id}@example.com`,
    passwordHash: 'hash',
    active: true,
    role: Role.TECHNICIAN,
    skills,
    maxActiveIncidents: capacity,
    availability,
    experienceYears: years,
    serviceHistory: [[service, history]],
  });
}
const asha = tech('asha', ['database', 'network'], 5, 6, 10);
const ben = tech('ben', ['network'], 3, 2, 0);
const chen = tech('chen', ['database'], 4, 9, 20);
const dev = tech('dev', ['application'], 5, 0, 0, Availability.ON_LEAVE);
const category = Category.create({
  id: asCategoryId('db'),
  code: 'DATABASE',
  name: 'Database',
  requiredSkill: 'database',
  active: true,
});
const loads = [
  new TechnicianLoad(asha, 1),
  new TechnicianLoad(ben, 0),
  new TechnicianLoad(chen, 4),
  new TechnicianLoad(dev, 0),
];
function context(candidates = loads): AssignmentContext {
  return new AssignmentContext(
    asIncidentId('incident'),
    service,
    Priority.P2,
    category,
    candidates,
  );
}

describe('assignment rules', () => {
  it('skillBasedPrefersRequiredSkill', () =>
    expect(new SkillBasedStrategy().rank(context())[0]?.technicianId).toBe(asha.id()));
  it('skillBasedBreaksTiesByLoad', () =>
    expect(
      new SkillBasedStrategy()
        .rank(context())
        .slice(0, 2)
        .map((r) => r.technicianId),
    ).toEqual([asha.id(), chen.id()]));
  it('loadBasedPrefersLeastLoaded', () =>
    expect(new LoadBasedStrategy().rank(context())[0]?.technicianId).toBe(ben.id()));
  it('roundRobinRotatesAndWraps', () => {
    const strategy = new RoundRobinStrategy();
    const ctx = context(loads.slice(0, 3));
    const picks = Array.from({ length: 4 }, () => {
      const first = strategy.rank(ctx)[0]!.technicianId;
      strategy.recordAssignment(first);
      return first;
    });
    expect(picks).toEqual([asha.id(), ben.id(), chen.id(), asha.id()]);
    strategy.reset();
    expect(strategy.rank(ctx)[0]?.technicianId).toBe(asha.id());
  });
  it('roundRobinPreviewDoesNotAdvanceRotation', () => {
    const strategy = new RoundRobinStrategy();
    const ctx = context(loads.slice(0, 3));
    strategy.rank(ctx);
    strategy.rank(ctx);
    expect(strategy.rank(ctx)[0]?.technicianId).toBe(asha.id());
  });
  it('assignerConfirmAdvancesRoundRobin', () => {
    const registry = AssignmentStrategyRegistry.withDefaults();
    registry.use('round-robin');
    const assigner = new TechnicianAssigner(registry);
    const ctx = context(loads.slice(0, 2));
    const first = assigner.pick(ctx);
    expect(assigner.pick(ctx).technicianId).toBe(first.technicianId);
    assigner.confirm(first);
    expect(assigner.pick(ctx).technicianId).not.toBe(first.technicianId);
  });
  it('experienceBasedPrefersServiceHistory', () =>
    expect(new ExperienceBasedStrategy().rank(context())[0]?.technicianId).toBe(chen.id()));
  it('experienceBasedAllZeroScoresZero', () =>
    expect(new ExperienceBasedStrategy().rank(context([loads[3]!]))[0]?.score).toBe(0));
  it('compositeBlendsScoresAndMergesReasons', () => {
    const result = CompositeAssignmentStrategy.smartDefault()
      .rank(context())
      .find((r) => r.technicianId === asha.id())!;
    expect(result.score).toBe(0.799);
    expect(result.reasons).toEqual([
      'has database skill',
      '1/5 active incidents',
      'resolved 10 incidents on this service · 6 years experience',
    ]);
  });
  it('compositeNeverPrefersUnskilledOverSkilledTechnician', () => {
    const skilledButBusy = tech('amy', ['database'], 5, 0, 0);
    const unskilledVeteran = tech('bob', ['network'], 5, 10, 0);
    const ranked = CompositeAssignmentStrategy.smartDefault().rank(
      context([new TechnicianLoad(skilledButBusy, 2), new TechnicianLoad(unskilledVeteran, 0)]),
    );
    expect(ranked[0]?.technicianId).toBe(skilledButBusy.id());
  });
  it('roundRobinReasonsShowRotationPosition', () =>
    expect(
      new RoundRobinStrategy().rank(context(loads.slice(0, 3))).map((r) => r.reasons[0]),
    ).toEqual(['next in rotation', 'position 2 in rotation', 'position 3 in rotation']));
  it('compositeRejectsSinglePart', () =>
    expect(
      () => new CompositeAssignmentStrategy([{ strategy: new LoadBasedStrategy(), weight: 1 }]),
    ).toThrow(InvalidInputException));
  it('compositeRejectsNonPositiveWeight', () => {
    for (const weight of [0, -1, NaN, Infinity])
      expect(
        () =>
          new CompositeAssignmentStrategy([
            { strategy: new LoadBasedStrategy(), weight },
            { strategy: new SkillBasedStrategy(), weight: 1 },
          ]),
      ).toThrow(InvalidInputException);
  });
  it('registrySwitchesStrategyAtRuntime', () => {
    const registry = AssignmentStrategyRegistry.withDefaults();
    expect(registry.active().name).toBe('composite');
    registry.use('load-based');
    expect(registry.active().name).toBe('load-based');
    expect(registry.names()).toHaveLength(5);
  });
  it('registryRejectsUnknownStrategy', () =>
    expect(() => AssignmentStrategyRegistry.withDefaults().use('unknown')).toThrow(
      InvalidInputException,
    ));
  it('registryRejectsDuplicateStrategy', () =>
    expect(
      () => new AssignmentStrategyRegistry([new LoadBasedStrategy(), new LoadBasedStrategy()]),
    ).toThrow(InvalidInputException));
  it('assignerSkipsUnavailableAndFullTechnicians', () =>
    expect(
      new TechnicianAssigner(AssignmentStrategyRegistry.withDefaults())
        .recommend(context())
        .map((r) => r.technicianId),
    ).toEqual([asha.id(), ben.id()]));
  it('assignerThrowsTechnicianUnavailableWhenNobodyAvailable', () =>
    expect(() =>
      new TechnicianAssigner(AssignmentStrategyRegistry.withDefaults()).pick(context([loads[3]!])),
    ).toThrow(TechnicianUnavailableException));
  it('assignerThrowsWorkloadExceededWhenAllAvailableAreFull', () =>
    expect(() =>
      new TechnicianAssigner(AssignmentStrategyRegistry.withDefaults()).pick(context([loads[2]!])),
    ).toThrow(WorkloadExceededException));
  it('recommendReturnsTopThreeWithReasons', () => {
    const extra = tech('erin', ['network'], 5, 1, 0);
    const result = new TechnicianAssigner(AssignmentStrategyRegistry.withDefaults()).recommend(
      context([...loads, new TechnicianLoad(extra, 0)]),
    );
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.reasons.length === 3)).toBe(true);
  });
  it('ranksAreDeterministicOnTies', () =>
    expect(
      new LoadBasedStrategy().rank(context([loads[3]!, loads[1]!])).map((r) => r.technicianId),
    ).toEqual([ben.id(), dev.id()]));
  it('rejectsInvalidTechnicianLoad', () => {
    for (const count of [-1, 1.5, NaN])
      expect(() => new TechnicianLoad(asha, count)).toThrow(InvalidInputException);
  });
  it.each([
    new SkillBasedStrategy(),
    new LoadBasedStrategy(),
    new RoundRobinStrategy(),
    new ExperienceBasedStrategy(),
    CompositeAssignmentStrategy.smartDefault(),
  ])('returnsEveryCandidateOnceWithSortedBoundedScores: $name', (strategy) => {
    const result = strategy.rank(context());
    expect(result).toHaveLength(loads.length);
    expect(new Set(result.map((r) => r.technicianId)).size).toBe(loads.length);
    expect(result.every((r) => r.score >= 0 && r.score <= 1)).toBe(true);
    expect(result.map((r) => r.score)).toEqual(result.map((r) => r.score).sort((a, b) => b - a));
  });
});

describe('assignment diagnostics and boundaries', () => {
  it('selectsTheFirstRegisteredStrategyAndRejectsMissingOrDuplicateNames', () => {
    const registry = new AssignmentStrategyRegistry();
    expect(registry.names()).toEqual([]);
    expect(() => registry.active()).toThrow(InvalidInputException);
    expect(() => registry.active()).toThrow(/active assignment strategy/i);
    const first = new SkillBasedStrategy();
    registry.register(first);
    registry.register(new LoadBasedStrategy());
    expect(registry.active()).toBe(first);
    for (const [action, message, details] of [
      [() => registry.register(first), /duplicate assignment strategy/i, { name: first.name }],
      [() => registry.use('missing'), /unknown assignment strategy/i, { name: 'missing' }],
    ] as const) {
      expect(action).toThrow(InvalidInputException);
      expect(action).toThrow(message);
      try {
        action();
      } catch (error) {
        expect(error).toMatchObject({ details });
      }
    }
  });
  it('usesStableStrategyNamesAndExplainsSkillMatches', () => {
    expect(new SkillBasedStrategy().name).toBe('skill-based');
    expect(new ExperienceBasedStrategy().name).toBe('experience-based');
    expect(
      new SkillBasedStrategy().rank(context([loads[0]!, loads[1]!])).map((r) => r.reasons),
    ).toEqual([['has database skill'], ['lacks database skill']]);
  });
  it('identifiesInvalidScoreLoadAndRecommendationLimit', () => {
    const assigner = new TechnicianAssigner(AssignmentStrategyRegistry.withDefaults());
    for (const [action, field] of [
      [() => new Recommendation(asha.id(), -1, [], 'test'), 'score'],
      [() => new TechnicianLoad(asha, -1), 'activeIncidents'],
      [() => assigner.recommend(context(), 1.5), 'limit'],
    ] as const) {
      expect(action).toThrow(InvalidInputException);
      expect(action).toThrow(new RegExp(field));
    }
    expect(assigner.recommend(context(), 0)).toEqual([]);
  });
  it('sortsRoundRobinCandidatesRegardlessOfInputOrderAndHandlesEmptyLists', () => {
    const strategy = new RoundRobinStrategy();
    expect(strategy.rank(context([]))).toEqual([]);
    for (const candidates of [
      [loads[2]!, loads[0]!, loads[1]!],
      [loads[1]!, loads[2]!, loads[0]!],
    ]) {
      expect(strategy.rank(context(candidates)).map((r) => r.technicianId)).toEqual([
        asha.id(),
        ben.id(),
        chen.id(),
      ]);
    }
    strategy.recordAssignment(chen.id());
    expect(strategy.rank(context([loads[1]!, loads[0]!]))[0]?.technicianId).toBe(asha.id());
    strategy.recordAssignment(asUserId('a'));
    expect(strategy.rank(context([loads[1]!, loads[0]!]))[0]?.technicianId).toBe(asha.id());
  });
  it('ordersEqualScoresByTechnicianIdInEitherInputOrder', () => {
    for (const candidates of [
      [loads[1]!, loads[3]!],
      [loads[3]!, loads[1]!],
    ]) {
      expect(new LoadBasedStrategy().rank(context(candidates)).map((r) => r.technicianId)).toEqual([
        ben.id(),
        dev.id(),
      ]);
    }
  });
  it('acceptsTwoCompositePartsAndGatesOnlyScoresBelowHalf', () => {
    const fixed = (score: number) => ({
      name: 'fixed',
      rank: () => [new Recommendation(asha.id(), score, ['first', 'extra'], 'fixed')],
    });
    for (const [score, expected] of [
      [0.499, 0.375],
      [0.5, 0.75],
    ] as const) {
      const composite = new CompositeAssignmentStrategy([
        { strategy: fixed(score), weight: 1, required: true },
        { strategy: fixed(1), weight: 1 },
      ]);
      const result = composite.rank(context([loads[0]!]))[0]!;
      expect(result.score).toBe(expected);
      expect(result.reasons).toEqual(['first', 'first']);
    }
  });
  it('normalizesVeryLargeUnequalCompositeWeights', () => {
    const composite = new CompositeAssignmentStrategy([
      { strategy: new SkillBasedStrategy(), weight: Number.MAX_VALUE },
      { strategy: new LoadBasedStrategy(), weight: Number.MAX_VALUE / 2 },
    ]);
    expect(composite.rank(context([loads[0]!]))[0]?.score).toBe(0.932);
  });
  it('reportsInvalidCompositeParts', () => {
    const parts = [{ strategy: new LoadBasedStrategy(), weight: 0 }];
    const action = () => new CompositeAssignmentStrategy(parts);
    expect(action).toThrow(InvalidInputException);
    expect(action).toThrow(/strategies/i);
    try {
      action();
    } catch (error) {
      expect(error).toMatchObject({ details: { parts } });
    }
  });
  it('reportsTheLeastLoadedFullTechnicianAndBreaksTiesById', () => {
    const assigner = new TechnicianAssigner(AssignmentStrategyRegistry.withDefaults());
    const fullA = new TechnicianLoad(asha, 10);
    const fullB = new TechnicianLoad(ben, 3);
    const fullC = new TechnicianLoad(chen, 4);
    for (const [candidates, id, active, max] of [
      [[fullA, fullB], ben.id(), 3, 3],
      [[new TechnicianLoad(ben, 4), new TechnicianLoad(asha, 6)], asha.id(), 6, 5],
      [[new TechnicianLoad(asha, 6), new TechnicianLoad(ben, 4)], asha.id(), 6, 5],
      [[fullC, fullB], ben.id(), 3, 3],
      [[fullB, fullC], ben.id(), 3, 3],
    ] as const) {
      const action = () => assigner.pick(context([...candidates]));
      expect(action).toThrow(WorkloadExceededException);
      try {
        action();
      } catch (error) {
        expect(error).toMatchObject({ details: { technicianId: id, active, max } });
      }
    }
  });
});
