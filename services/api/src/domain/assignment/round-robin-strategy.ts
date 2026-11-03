import type { UserId } from '../shared/index.js';
import type { AssignmentStrategy } from './assignment-strategy.js';
import type { AssignmentContext } from './assignment-context.js';
import { Recommendation } from './recommendation.js';
import { sortRecommendations } from './ranking.js';

/** Stateful Concrete Strategy: ranks the technician after the last one assigned first. */
export class RoundRobinStrategy implements AssignmentStrategy {
  readonly name = 'round-robin';
  private cursor: UserId | undefined;
  reset(): void {
    this.cursor = undefined;
  }
  recordAssignment(technicianId: UserId): void {
    this.cursor = technicianId;
  }
  rank(ctx: AssignmentContext): Recommendation[] {
    const sorted = [...ctx.candidates].sort((a, b) =>
      a.technician.id() < b.technician.id() ? -1 : a.technician.id() > b.technician.id() ? 1 : 0,
    );
    if (!sorted.length) return [];
    const next =
      this.cursor === undefined
        ? 0
        : sorted.findIndex((load) => load.technician.id() > this.cursor!);
    const start = next < 0 ? 0 : next;
    const rotated = [...sorted.slice(start), ...sorted.slice(0, start)];
    return sortRecommendations(
      rotated.map(
        (load, i) =>
          new Recommendation(
            load.technician.id(),
            1 - i / rotated.length,
            [i === 0 ? 'next in rotation' : `position ${i + 1} in rotation`],
            this.name,
          ),
      ),
    );
  }
}
