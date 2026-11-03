import { numberIn, invalid } from './validation.js';
/** Immutable non-negative duration. */
export class Duration {
  private constructor(readonly ms: number) {}
  static ofMs(ms: number): Duration {
    return new Duration(numberIn(ms, 'ms', 0, Number.MAX_SAFE_INTEGER));
  }
  static ofSeconds(n: number): Duration {
    return Duration.ofMs(n * 1000);
  }
  static ofMinutes(n: number): Duration {
    return Duration.ofMs(n * 60000);
  }
  static ofHours(n: number): Duration {
    return Duration.ofMs(n * 3600000);
  }
  get minutes(): number {
    return this.ms / 60000;
  }
  plus(other: Duration): Duration {
    return Duration.ofMs(this.ms + other.ms);
  }
  minus(other: Duration): Duration {
    return Duration.ofMs(this.ms - other.ms);
  }
  times(factor: number): Duration {
    if (!Number.isFinite(factor) || factor < 0) return invalid('factor', factor);
    return Duration.ofMs(this.ms * factor);
  }
  compare(other: Duration): number {
    return Math.sign(this.ms - other.ms);
  }
  equals(other: Duration): boolean {
    return this.ms === other.ms;
  }
  toString(): string {
    return `${this.ms}ms`;
  }
  toJSON(): number {
    return this.ms;
  }
}
