import { jaccard, overlap, TextFingerprint } from './text-fingerprint.js';
import { SimilarityPolicy } from './similarity-policy.js';

/** What the similarity rules need to know about an incident (or a draft report). */
export interface SimilaritySubject {
  readonly title: string;
  readonly description: string;
  readonly serviceId?: string | undefined;
}
export interface SimilarityScore {
  readonly score: number;
  readonly reasons: readonly string[];
}
const MAX_SHARED_WORDS_SHOWN = 5;

/**
 * Domain service: scores how likely two incidents describe the same problem, with reasons a
 * person can check. Pure rules (no ML), so duplicate detection works with the ML service down.
 */
export class TextSimilarity {
  constructor(readonly policy: SimilarityPolicy = SimilarityPolicy.DEFAULT) {}
  score(a: SimilaritySubject, b: SimilaritySubject): SimilarityScore {
    const left = TextFingerprint.of(a.title, a.description);
    const right = TextFingerprint.of(b.title, b.description);
    const { titleWeight, sameServiceBoost } = this.policy;
    const text =
      titleWeight * jaccard(left.titleTokens, right.titleTokens) +
      (1 - titleWeight) * overlap(left.allTokens, right.allTokens);
    const shared = left.sharedWords(right);
    // A shared service alone is not similarity: the boost only applies once some words match.
    const sameService = !!a.serviceId && a.serviceId === b.serviceId && shared.length > 0;
    const reasons: string[] = [];
    if (sameService) reasons.push('same service');
    if (shared.length)
      reasons.push(`shares: ${shared.slice(0, MAX_SHARED_WORDS_SHOWN).join(', ')}`);
    return {
      score: round(Math.min(1, text + (sameService ? sameServiceBoost : 0))),
      reasons,
    };
  }
  isSimilar(score: SimilarityScore): boolean {
    return score.score >= this.policy.threshold;
  }
  /** The candidates passing the threshold, best first, at most `limit`. */
  rank<T extends SimilaritySubject>(
    query: SimilaritySubject,
    candidates: readonly T[],
    limit: number,
  ): Array<{ subject: T } & SimilarityScore> {
    return candidates
      .map((subject) => ({ subject, ...this.score(query, subject) }))
      .filter((match) => this.isSimilar(match))
      .sort((x, y) => y.score - x.score)
      .slice(0, limit);
  }
}

const round = (value: number) => Math.round(value * 100) / 100;
