import { InvalidInputException } from '../exceptions/index.js';
import type { AssignmentStrategy } from './assignment-strategy.js';
import type { AssignmentContext } from './assignment-context.js';
import { Recommendation } from './recommendation.js';
import { sortRecommendations } from './ranking.js';
import { SkillBasedStrategy } from './skill-based-strategy.js';
import { LoadBasedStrategy } from './load-based-strategy.js';
import { ExperienceBasedStrategy } from './experience-based-strategy.js';

export interface CompositePart {
  readonly strategy: AssignmentStrategy;
  readonly weight: number;
  /** A required part acts as a gate: candidates scoring below 0.5 on it have their total halved. */
  readonly required?: boolean;
}

/** Composite Strategy combining weighted child strategies. */
export class CompositeAssignmentStrategy implements AssignmentStrategy {
  readonly name = 'composite';
  private readonly parts: ReadonlyArray<Required<CompositePart>>;
  constructor(parts: CompositePart[]) {
    if (parts.length < 2 || parts.some(({ weight }) => !Number.isFinite(weight) || weight <= 0))
      throw new InvalidInputException(
        'At least two strategies with positive finite weights are required.',
        { parts },
      );
    const max = Math.max(...parts.map(({ weight }) => weight));
    const total = parts.reduce((sum, part) => sum + part.weight / max, 0);
    this.parts = parts.map(({ strategy, weight, required = false }) => ({
      strategy,
      weight: weight / max / total,
      required,
    }));
  }
  static smartDefault(): CompositeAssignmentStrategy {
    return new CompositeAssignmentStrategy([
      { strategy: new SkillBasedStrategy(), weight: 0.4, required: true },
      { strategy: new LoadBasedStrategy(), weight: 0.3 },
      { strategy: new ExperienceBasedStrategy(), weight: 0.3 },
    ]);
  }
  rank(ctx: AssignmentContext): Recommendation[] {
    const rankings = this.parts.map(
      ({ strategy }) => new Map(strategy.rank(ctx).map((r) => [r.technicianId, r])),
    );
    return sortRecommendations(
      ctx.candidates.map(({ technician }) => {
        const items = rankings.map((ranking) => ranking.get(technician.id())!);
        const blended = items.reduce((sum, item, i) => sum + item.score * this.parts[i]!.weight, 0);
        const gated = items.some((item, i) => this.parts[i]!.required && item.score < 0.5);
        const score = gated ? blended / 2 : blended;
        return new Recommendation(
          technician.id(),
          Math.min(1, score),
          items.flatMap((item) => item.reasons.slice(0, 1)),
          this.name,
        );
      }),
    );
  }
}
