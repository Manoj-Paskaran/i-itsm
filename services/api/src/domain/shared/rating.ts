import { numberIn } from './validation.js';
/** Immutable feedback rating. */
export class Rating {
  private constructor(readonly value: number) {}
  static of(value: number): Rating {
    return new Rating(numberIn(value, 'rating', 1, 5, true));
  }
  equals(other: Rating): boolean {
    return this.value === other.value;
  }
  toString(): string {
    return String(this.value);
  }
  toJSON(): number {
    return this.value;
  }
}
