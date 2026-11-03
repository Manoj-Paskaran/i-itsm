import { Duration } from './duration.js';
import { numberIn, invalid } from './validation.js';
/** Immutable point on the UTC timeline. */
export class Instant {
  private constructor(readonly ms: number) {}
  static of(ms: number): Instant {
    return new Instant(numberIn(ms, 'ms', 0, 8640000000000000, true));
  }
  static fromDate(date: Date): Instant {
    return Instant.of(date.getTime());
  }
  static fromIso(iso: string): Instant {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return invalid('iso', iso);
    return Instant.of(ms);
  }
  toDate(): Date {
    return new Date(this.ms);
  }
  toIso(): string {
    return this.toDate().toISOString();
  }
  plus(d: Duration): Instant {
    return Instant.of(this.ms + d.ms);
  }
  minus(d: Duration): Instant {
    return Instant.of(this.ms - d.ms);
  }
  until(other: Instant): Duration {
    return Duration.ofMs(other.ms - this.ms);
  }
  isBefore(other: Instant): boolean {
    return this.ms < other.ms;
  }
  isAfter(other: Instant): boolean {
    return this.ms > other.ms;
  }
  compare(other: Instant): number {
    return Math.sign(this.ms - other.ms);
  }
  equals(other: Instant): boolean {
    return this.ms === other.ms;
  }
  toString(): string {
    return this.toIso();
  }
  toJSON(): string {
    return this.toIso();
  }
}
