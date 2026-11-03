import type { AssignmentStrategy } from './assignment-strategy.js';
import type { AssignmentContext } from './assignment-context.js';
import { Recommendation } from './recommendation.js';
import { sortRecommendations } from './ranking.js';

/** Concrete Strategy ranking technicians by spare capacity. */
export class LoadBasedStrategy implements AssignmentStrategy {
  readonly name = 'load-based';
  rank(ctx: AssignmentContext): Recommendation[] {
    return sortRecommendations(
      ctx.candidates.map(
        (load) =>
          new Recommendation(
            load.technician.id(),
            1 - load.loadRatio(),
            [`${load.activeIncidents}/${load.technician.capacity()} active incidents`],
            this.name,
          ),
      ),
    );
  }
}
