import { Priority } from '../shared/index.js';

/** Immutable outcome, score, strategy name, and rationale from a priority assessment. */
export class PriorityAssessment {
  readonly rationale: readonly string[];
  constructor(
    readonly priority: Priority,
    readonly score: number,
    readonly strategy: string,
    rationale: readonly string[],
  ) {
    this.rationale = Object.freeze([...rationale]);
  }
}
