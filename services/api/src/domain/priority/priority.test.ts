import { describe, expect, it } from 'vitest';
import { InvalidInputException } from '../exceptions/index.js';
import { BusinessCriticality, Impact, Priority, Urgency } from '../shared/index.js';
import {
  MatrixPriorityStrategy,
  PriorityInput,
  PriorityStrategyRegistry,
  WeightedScorePriorityStrategy,
  type PriorityStrategy,
} from './index.js';

const input = (impact: number, urgency: number, criticality: number, users = 1) =>
  new PriorityInput(
    Impact.of(impact),
    Urgency.of(urgency),
    BusinessCriticality.of(criticality),
    users,
  );

describe('weighted priority', () => {
  const strategy = new WeightedScorePriorityStrategy();
  it.each([
    [4, 4, 2, 1, 32, Priority.P1],
    [2, 3, 4, 50, 30, Priority.P2],
    [4, 4, 1, 1, 16, Priority.P2],
    [3, 4, 1, 50, 15, Priority.P3],
    [1, 2, 3, 1, 6, Priority.P3],
    [1, 2, 2, 50, 5, Priority.P4],
    [4, 4, 4, 300, 80, Priority.P1],
    [1, 2, 2, 1, 4, Priority.P4],
  ])('maps score for %i/%i/%i and %i users to %s and %s', (i, u, c, users, score, priority) => {
    expect(strategy.assess(input(i, u, c, users))).toMatchObject({ score, priority });
  });
  it.each([
    [9, 4],
    [10, 4.4],
    [49, 4.4],
    [50, 5],
    [499, 5],
    [500, 6],
  ])('applies the user factor at %i affected users', (users, score) =>
    expect(strategy.assess(input(1, 2, 2, users)).score).toBe(score),
  );
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid affected user count %s',
    (users) => {
      expect(() => input(1, 1, 1, users)).toThrow(InvalidInputException);
    },
  );
  it.each([
    { p1: 16, p2: 16, p3: 6 },
    { p1: 10, p2: 11, p3: 6 },
    { p1: 32, p2: 16, p3: 0 },
    { p1: Infinity, p2: 16, p3: 6 },
  ])('rejects invalid thresholds %j', (thresholds) => {
    expect(() => new WeightedScorePriorityStrategy(thresholds)).toThrow(InvalidInputException);
  });
  it('uses custom thresholds to change the priority', () => {
    expect(
      new WeightedScorePriorityStrategy({ p1: 64, p2: 32, p3: 16 }).assess(input(4, 4, 2)).priority,
    ).toBe(Priority.P2);
  });
  it('explains the calculation and protects its rationale from mutation', () => {
    const assessment = strategy.assess(input(3, 4, 4, 120));
    expect(assessment.rationale).toEqual([
      'Impact High (3) × Urgency Critical (4) × Criticality Mission-critical (4) = 48',
      'Affected users 120 → ×1.25',
      'Score 60.0 ≥ 32 → P1 Critical',
    ]);
    expect(Object.isFrozen(assessment.rationale)).toBe(true);
  });
});

describe('impact urgency matrix', () => {
  const strategy = new MatrixPriorityStrategy();
  const table = [
    [Priority.P4, Priority.P4, Priority.P3, Priority.P3],
    [Priority.P4, Priority.P3, Priority.P3, Priority.P2],
    [Priority.P3, Priority.P3, Priority.P2, Priority.P1],
    [Priority.P3, Priority.P2, Priority.P1, Priority.P1],
  ];
  it.each([2, 3])('uses the full matrix without adjustment for criticality %i', (criticality) => {
    for (let i = 1; i <= 4; i++)
      for (let u = 1; u <= 4; u++) {
        expect(strategy.assess(input(i, u, criticality))).toMatchObject({
          priority: table[i - 1]![u - 1],
          score: i + u,
        });
      }
  });
  it.each([
    [2, 2, 4, Priority.P2],
    [2, 2, 1, Priority.P4],
    [4, 4, 4, Priority.P1],
    [1, 1, 1, Priority.P4],
  ])('adjusts and clamps priority for %i/%i/%i', (i, u, c, expected) => {
    expect(strategy.assess(input(i, u, c)).priority).toBe(expected);
  });
});

describe('strategy registry', () => {
  const weighted = new WeightedScorePriorityStrategy();
  const matrix = new MatrixPriorityStrategy();
  it('switches the active strategy at runtime', () => {
    const registry = new PriorityStrategyRegistry([weighted, matrix], weighted.name);
    expect(registry.names()).toEqual([weighted.name, matrix.name]);
    expect(registry.active()).toBe(weighted);
    registry.use(matrix.name);
    expect(registry.active()).toBe(matrix);
  });
  it('rejects unknown names without changing the active strategy', () => {
    const registry = new PriorityStrategyRegistry([weighted], weighted.name);
    expect(() => registry.use('unknown')).toThrow(InvalidInputException);
    expect(registry.active()).toBe(weighted);
    expect(() => new PriorityStrategyRegistry([weighted], 'unknown')).toThrow(
      InvalidInputException,
    );
  });
  it('rejects duplicate names', () => {
    expect(() => new PriorityStrategyRegistry([weighted, weighted], weighted.name)).toThrow(
      InvalidInputException,
    );
  });
});

it.each<PriorityStrategy>([new WeightedScorePriorityStrategy(), new MatrixPriorityStrategy()])(
  'assesses through the shared strategy interface: $name',
  (strategy) => {
    const assessment = strategy.assess(input(3, 4, 4, 120));
    expect(Priority.all()).toContain(assessment.priority);
    expect(Number.isFinite(assessment.score)).toBe(true);
    expect(assessment.strategy).toBe(strategy.name);
    expect(assessment.rationale.length).toBeGreaterThan(0);
  },
);

describe('priority explanations and diagnostics', () => {
  it('exposesStableStrategyNames', () => {
    expect(new MatrixPriorityStrategy().name).toBe('impact-urgency-matrix');
    expect(new WeightedScorePriorityStrategy().name).toBe('weighted-score');
  });
  it.each([
    [4, 'raise one level'],
    [1, 'lower one level'],
    [2, 'no adjustment'],
  ])('explainsMatrixCriticalityAdjustment%s', (criticality, action) => {
    const rationale = new MatrixPriorityStrategy().assess(input(2, 2, criticality)).rationale;
    expect(rationale[0]).toMatch(/Impact Medium.*Urgency Medium.*P3/);
    expect(rationale[1]).toContain(action);
    expect(rationale[2]).toMatch(/Final priority → P[234]/);
  });
  it.each([
    [input(4, 4, 2), '≥ 32'],
    [input(4, 4, 1), '≥ 16'],
    [input(1, 2, 3), '≥ 6'],
    [input(1, 2, 2), '< 6'],
  ])('explainsTheThresholdForEachPriority', (value, comparison) => {
    expect(new WeightedScorePriorityStrategy().assess(value).rationale[2]).toContain(comparison);
  });
  it('rejectsEqualLowerThresholdsAndAcceptsStrictlyDescendingThresholds', () => {
    expect(() => new WeightedScorePriorityStrategy({ p1: 10, p2: 5, p3: 5 })).toThrow(
      InvalidInputException,
    );
    expect(() => new WeightedScorePriorityStrategy({ p1: 10, p2: 5, p3: 4 })).not.toThrow();
  });
  it('identifiesInvalidInputsAndStrategyNames', () => {
    const weighted = new WeightedScorePriorityStrategy();
    const registry = new PriorityStrategyRegistry([weighted], weighted.name);
    const thresholds = { p1: 10, p2: 5, p3: 5 };
    for (const [action, message, details] of [
      [() => input(1, 1, 1, 0), /affectedUsers/, { affectedUsers: 0 }],
      [() => new WeightedScorePriorityStrategy(thresholds), /thresholds/i, thresholds],
      [() => registry.use('missing'), /unknown priority strategy/i, { name: 'missing' }],
      [
        () => new PriorityStrategyRegistry([weighted, weighted], weighted.name),
        /duplicate priority strategy/i,
        { name: weighted.name },
      ],
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
});
