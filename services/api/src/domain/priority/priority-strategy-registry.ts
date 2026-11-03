import { InvalidInputException } from '../exceptions/index.js';
import type { PriorityStrategy } from './priority-strategy.js';

/** Registry for selecting and exposing the active priority strategy. */
export class PriorityStrategyRegistry {
  private readonly strategies: Map<string, PriorityStrategy>;
  private current: PriorityStrategy;

  constructor(strategies: readonly PriorityStrategy[], defaultName: string) {
    this.strategies = new Map();
    for (const strategy of strategies) {
      if (this.strategies.has(strategy.name)) {
        throw new InvalidInputException('Duplicate priority strategy.', { name: strategy.name });
      }
      this.strategies.set(strategy.name, strategy);
    }
    this.current = this.find(defaultName);
  }

  private find(name: string): PriorityStrategy {
    const strategy = this.strategies.get(name);
    if (!strategy) throw new InvalidInputException('Unknown priority strategy.', { name });
    return strategy;
  }

  use(name: string): void {
    this.current = this.find(name);
  }

  active(): PriorityStrategy {
    return this.current;
  }

  names(): readonly string[] {
    return [...this.strategies.keys()];
  }
}
