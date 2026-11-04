import { InvalidInputException } from '../exceptions/index.js';
import { TextSimilarity, type SimilaritySubject } from './text-similarity.js';

export interface CorrelationSubject extends SimilaritySubject {
  readonly id: string;
  readonly serviceId: string;
  readonly createdAt: Date;
}
export interface Correlation<T> {
  /** The anchor first, then the related incidents, oldest first within each linkage round. */
  readonly members: readonly T[];
  readonly windowMinutes: number;
}

/**
 * Policy (IF-B): open incidents on the same service, all reported within one time window
 * and with similar text, likely share a common cause. Grows the cluster from the anchor by
 * single linkage: a candidate joins when it is similar to any member already in the cluster.
 */
export class CorrelationPolicy {
  static readonly DEFAULT = new CorrelationPolicy(120, 2);
  constructor(
    readonly windowMinutes: number,
    /** How many other incidents must join the anchor before it counts as a cluster. */
    readonly minOthers: number,
    private readonly similarity: TextSimilarity = new TextSimilarity(),
  ) {
    if (
      !Number.isInteger(windowMinutes) ||
      windowMinutes < 1 ||
      !Number.isInteger(minOthers) ||
      minOthers < 1
    )
      throw new InvalidInputException('Correlation window and size must be positive integers', {
        windowMinutes,
        minOthers,
      });
  }
  correlate<T extends CorrelationSubject>(
    anchor: T,
    openIncidents: readonly T[],
  ): Correlation<T> | null {
    const windowMs = this.windowMinutes * 60_000;
    const pending = openIncidents.filter(
      (other) =>
        other.id !== anchor.id &&
        other.serviceId === anchor.serviceId &&
        Math.abs(other.createdAt.getTime() - anchor.createdAt.getTime()) <= windowMs,
    );
    // Oldest first, so the cluster lists incidents in the order they were reported.
    pending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const members: T[] = [anchor];
    // The window spans the whole cluster, not each member's distance from the anchor.
    let earliest = anchor.createdAt.getTime();
    let latest = earliest;
    for (let grew = true; grew;) {
      grew = false;
      for (const candidate of [...pending]) {
        const t = candidate.createdAt.getTime();
        if (Math.max(latest, t) - Math.min(earliest, t) > windowMs) continue;
        if (members.some((m) => this.similarity.isSimilar(this.similarity.score(m, candidate)))) {
          earliest = Math.min(earliest, t);
          latest = Math.max(latest, t);
          members.push(candidate);
          pending.splice(pending.indexOf(candidate), 1);
          grew = true;
        }
      }
    }
    return members.length - 1 >= this.minOthers
      ? { members, windowMinutes: this.windowMinutes }
      : null;
  }
  /** "3 open Payment Gateway incidents with similar text in 2 h" */
  static describe(size: number, windowMinutes: number, serviceName: string): string {
    const window = windowMinutes % 60 === 0 ? `${windowMinutes / 60} h` : `${windowMinutes} min`;
    return `${size} open ${serviceName} incidents with similar text in ${window}`;
  }
}
