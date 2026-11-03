import type { AssignmentStrategy } from './assignment-strategy.js';
import type { AssignmentContext } from './assignment-context.js';
import { Recommendation } from './recommendation.js';
import { sortRecommendations } from './ranking.js';

/** Concrete Strategy ranking service history and years of experience. */
export class ExperienceBasedStrategy implements AssignmentStrategy {
  readonly name = 'experience-based';
  rank(ctx: AssignmentContext): Recommendation[] {
    const raw = ctx.candidates.map(
      ({ technician }) => 2 * technician.experienceWith(ctx.serviceId) + technician.experience(),
    );
    const max = Math.max(0, ...raw);
    return sortRecommendations(
      ctx.candidates.map(
        ({ technician }, i) =>
          new Recommendation(
            technician.id(),
            max ? raw[i]! / max : 0,
            [
              `resolved ${technician.experienceWith(ctx.serviceId)} incidents on this service · ${technician.experience()} years experience`,
            ],
            this.name,
          ),
      ),
    );
  }
}
