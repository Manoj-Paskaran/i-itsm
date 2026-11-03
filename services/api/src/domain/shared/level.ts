import { numberIn } from './validation.js';
export type LevelValue = 1 | 2 | 3 | 4;
/** Shared validation and comparison for four-point scales. */
export abstract class Level {
  readonly value: LevelValue;
  readonly label: string;
  protected constructor(value: number, labels: readonly string[]) {
    this.value = numberIn(value, 'value', 1, 4, true) as LevelValue;
    this.label = labels[this.value - 1]!;
  }
  equals(other: Level): boolean {
    return this.constructor === other.constructor && this.value === other.value;
  }
  compare(other: Level): number {
    return Math.sign(this.value - other.value);
  }
  toString(): string {
    return this.label;
  }
  toJSON(): number {
    return this.value;
  }
}
