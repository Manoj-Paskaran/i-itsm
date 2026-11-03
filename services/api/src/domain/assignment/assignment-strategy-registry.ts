import { InvalidInputException } from '../exceptions/index.js';
import type { AssignmentStrategy } from './assignment-strategy.js';
import { SkillBasedStrategy } from './skill-based-strategy.js';
import { LoadBasedStrategy } from './load-based-strategy.js';
import { RoundRobinStrategy } from './round-robin-strategy.js';
import { ExperienceBasedStrategy } from './experience-based-strategy.js';
import { CompositeAssignmentStrategy } from './composite-assignment-strategy.js';

/** Registry selecting the active assignment Strategy at runtime. */
export class AssignmentStrategyRegistry {
  private readonly strategies = new Map<string, AssignmentStrategy>();
  private selected: string | undefined;
  constructor(strategies: readonly AssignmentStrategy[] = []) {
    strategies.forEach((strategy) => this.register(strategy));
  }
  register(strategy: AssignmentStrategy): void {
    if (this.strategies.has(strategy.name))
      throw new InvalidInputException('Duplicate assignment strategy.', { name: strategy.name });
    this.strategies.set(strategy.name, strategy);
    this.selected ??= strategy.name;
  }
  use(name: string): void {
    if (!this.strategies.has(name))
      throw new InvalidInputException('Unknown assignment strategy.', { name });
    this.selected = name;
  }
  active(): AssignmentStrategy {
    const strategy = this.selected && this.strategies.get(this.selected);
    if (!strategy) throw new InvalidInputException('No active assignment strategy.', {});
    return strategy;
  }
  names(): string[] {
    return [...this.strategies.keys()];
  }
  static withDefaults(): AssignmentStrategyRegistry {
    const registry = new AssignmentStrategyRegistry([
      new SkillBasedStrategy(),
      new LoadBasedStrategy(),
      new RoundRobinStrategy(),
      new ExperienceBasedStrategy(),
      CompositeAssignmentStrategy.smartDefault(),
    ]);
    registry.use('composite');
    return registry;
  }
}
