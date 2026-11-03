import { InvalidInputException } from '../exceptions/index.js';
import { Priority } from '../shared/index.js';
import { PriorityAssessment } from './priority-assessment.js';
import type { PriorityInput } from './priority-input.js';
import type { PriorityStrategy, PriorityThresholds } from './priority-strategy.js';

/** Strategy pattern: default priority algorithm (impact × urgency × criticality × user factor). */
export class WeightedScorePriorityStrategy implements PriorityStrategy {
  readonly name = 'weighted-score';
  private readonly thresholds: PriorityThresholds;

  constructor(thresholds: PriorityThresholds = { p1: 32, p2: 16, p3: 6 }) {
    const { p1, p2, p3 } = thresholds;
    if (![p1, p2, p3].every(Number.isFinite) || !(p1 > p2 && p2 > p3 && p3 > 0)) {
      throw new InvalidInputException(
        'Priority thresholds must be positive and strictly descending.',
        {
          p1,
          p2,
          p3,
        },
      );
    }
    this.thresholds = { p1, p2, p3 };
  }

  assess(input: PriorityInput): PriorityAssessment {
    const { impact, urgency, criticality, affectedUsers } = input;
    const base = impact.value * urgency.value * criticality.value;
    const factor =
      affectedUsers >= 500 ? 1.5 : affectedUsers >= 50 ? 1.25 : affectedUsers >= 10 ? 1.1 : 1;
    const score = Math.round(base * factor * 10) / 10;
    const { p1, p2, p3 } = this.thresholds;
    const priority =
      score >= p1
        ? Priority.P1
        : score >= p2
          ? Priority.P2
          : score >= p3
            ? Priority.P3
            : Priority.P4;
    const comparison =
      priority === Priority.P4
        ? `< ${p3}`
        : `≥ ${priority === Priority.P1 ? p1 : priority === Priority.P2 ? p2 : p3}`;
    return new PriorityAssessment(priority, score, this.name, [
      `Impact ${impact.label} (${impact.value}) × Urgency ${urgency.label} (${urgency.value}) × Criticality ${criticality.label} (${criticality.value}) = ${base}`,
      `Affected users ${affectedUsers} → ×${factor}`,
      `Score ${score.toFixed(1)} ${comparison} → ${priority.value} ${priority.label}`,
    ]);
  }
}
