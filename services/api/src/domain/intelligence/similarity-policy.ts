import { InvalidInputException } from '../exceptions/index.js';

/** Tunable thresholds and weights of the rule-based similarity, kept in one explainable place. */
export class SimilarityPolicy {
  static readonly DEFAULT = new SimilarityPolicy(0.25, 0.15, 0.6);
  constructor(
    /** Minimum score for an incident to count as "similar". */
    readonly threshold: number,
    /** Added when both incidents are on the same IT service. */
    readonly sameServiceBoost: number,
    /** Share of the text score taken from title-to-title Jaccard; the rest is full-text overlap. */
    readonly titleWeight: number,
  ) {
    for (const [name, value] of Object.entries({ threshold, sameServiceBoost, titleWeight }))
      if (!(value >= 0 && value <= 1))
        throw new InvalidInputException('Similarity weights must be between 0 and 1', {
          [name]: value,
        });
  }
}
