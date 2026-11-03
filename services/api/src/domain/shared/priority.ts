import { invalid } from './validation.js';
export type PriorityCode = 'P1' | 'P2' | 'P3' | 'P4';
/** Canonical incident priority ordered by urgency. */
export class Priority {
  static readonly P1 = new Priority('P1', 1, 'Critical');
  static readonly P2 = new Priority('P2', 2, 'High');
  static readonly P3 = new Priority('P3', 3, 'Medium');
  static readonly P4 = new Priority('P4', 4, 'Low');
  private constructor(
    readonly value: PriorityCode,
    readonly rank: number,
    readonly label: string,
  ) {}
  static all(): readonly Priority[] {
    return [Priority.P1, Priority.P2, Priority.P3, Priority.P4];
  }
  static of(value: string): Priority {
    return Priority.all().find((p) => p.value === value) ?? invalid('priority', value);
  }
  static fromRank(rank: number): Priority {
    return Priority.all().find((p) => p.rank === rank) ?? invalid('rank', rank);
  }
  isHigherThan(other: Priority): boolean {
    return this.rank < other.rank;
  }
  compare(other: Priority): number {
    return Math.sign(this.rank - other.rank);
  }
  equals(other: Priority): boolean {
    return this === other;
  }
  toString(): string {
    return this.value;
  }
  toJSON(): string {
    return this.value;
  }
}
