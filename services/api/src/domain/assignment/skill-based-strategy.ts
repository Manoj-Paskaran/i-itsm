import type { AssignmentStrategy } from './assignment-strategy.js';
import type { AssignmentContext } from './assignment-context.js';
import { Recommendation } from './recommendation.js';
import { sortRecommendations } from './ranking.js';

/** Concrete Strategy ranking required skill first and workload second. */
export class SkillBasedStrategy implements AssignmentStrategy {
  readonly name = 'skill-based';
  rank(ctx: AssignmentContext): Recommendation[] {
    return sortRecommendations(
      ctx.candidates.map((load) => {
        const skill = ctx.category.skill();
        const hasSkill = load.technician.hasSkill(skill);
        return new Recommendation(
          load.technician.id(),
          (hasSkill ? 0.99 : 0) + (1 - load.loadRatio()) * 0.01,
          [`${hasSkill ? 'has' : 'lacks'} ${skill.value} skill`],
          this.name,
        );
      }),
    );
  }
}
