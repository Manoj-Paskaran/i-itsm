import type { UserId } from '../shared/index.js';
import { numberIn } from '../shared/validation.js';

/** Value object describing a ranked assignment recommendation. */
export class Recommendation {
  readonly score: number;
  readonly reasons: readonly string[];
  constructor(
    readonly technicianId: UserId,
    score: number,
    reasons: readonly string[],
    readonly strategy: string,
  ) {
    this.score = Math.round(numberIn(score, 'score', 0, 1) * 1000) / 1000;
    this.reasons = [...reasons];
  }
}
