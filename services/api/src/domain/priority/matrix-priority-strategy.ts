import { Priority } from '../shared/index.js';
import { PriorityAssessment } from './priority-assessment.js';
import type { PriorityInput } from './priority-input.js';
import type { PriorityStrategy } from './priority-strategy.js';

/** Strategy pattern: impact–urgency matrix with a criticality adjustment. */
export class MatrixPriorityStrategy implements PriorityStrategy {
  readonly name = 'impact-urgency-matrix';

  assess(input: PriorityInput): PriorityAssessment {
    const { impact, urgency, criticality } = input;
    const score = impact.value + urgency.value;
    const initial =
      score >= 7 ? Priority.P1 : score === 6 ? Priority.P2 : score >= 4 ? Priority.P3 : Priority.P4;
    const adjustment = criticality.value === 4 ? -1 : criticality.value === 1 ? 1 : 0;
    const priority = Priority.fromRank(Math.max(1, Math.min(4, initial.rank + adjustment)));
    const action =
      adjustment === -1
        ? 'raise one level'
        : adjustment === 1
          ? 'lower one level'
          : 'no adjustment';
    return new PriorityAssessment(priority, score, this.name, [
      `Impact ${impact.label} (${impact.value}) + Urgency ${urgency.label} (${urgency.value}) = ${score} → ${initial.value} ${initial.label}`,
      `Criticality ${criticality.label} (${criticality.value}) → ${action}, clamped to P1–P4`,
      `Final priority → ${priority.value} ${priority.label}`,
    ]);
  }
}
