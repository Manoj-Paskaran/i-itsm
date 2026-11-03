import { Instant } from './instant.js';
import { Duration } from './duration.js';
export interface Clock {
  now(): Instant;
}
/** Production clock backed by the system time. */
export class SystemClock implements Clock {
  now(): Instant {
    return Instant.of(Date.now());
  }
}
/** Controllable clock for deterministic domain tests. */
export class FixedClock implements Clock {
  constructor(private current: Instant) {}
  now(): Instant {
    return this.current;
  }
  set(i: Instant): void {
    this.current = i;
  }
  advance(d: Duration): void {
    this.current = this.current.plus(d);
  }
}
