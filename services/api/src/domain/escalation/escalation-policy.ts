import { InvalidInputException } from '../exceptions/index.js';
import { Duration, Priority, type PriorityCode } from '../shared/index.js';
export type EscalationThresholds = readonly [Duration, Duration, Duration];
/** Value object defining cumulative escalation thresholds. */
export class EscalationPolicy {
  private readonly thresholds: Readonly<Record<PriorityCode, EscalationThresholds>>;
  constructor(thresholds: Readonly<Record<PriorityCode, EscalationThresholds>>) {
    for (const priority of Priority.all()) {
      const t = thresholds[priority.value];
      if (
        !t ||
        t.length !== 3 ||
        t.some((d) => !(d instanceof Duration)) ||
        t[0].ms <= 0 ||
        t[0].ms >= t[1].ms ||
        t[1].ms >= t[2].ms
      )
        throw new InvalidInputException(
          'Escalation thresholds must be positive and strictly ascending',
          { priority: priority.value },
        );
    }
    this.thresholds = Object.fromEntries(
      Priority.all().map((p) => [p.value, Object.freeze([...thresholds[p.value]])]),
    ) as unknown as Readonly<Record<PriorityCode, EscalationThresholds>>;
  }
  static standard(): EscalationPolicy {
    const m = (n: number) => Duration.ofMinutes(n);
    const h = (n: number) => Duration.ofHours(n);
    return new EscalationPolicy({
      P1: [m(5), m(10), m(20)],
      P2: [m(15), m(30), m(60)],
      P3: [h(1), h(2), h(4)],
      P4: [h(4), h(8), h(16)],
    });
  }
  static demo(): EscalationPolicy {
    const s = (n: number) => Duration.ofSeconds(n);
    const standard = EscalationPolicy.standard();
    return new EscalationPolicy({
      P1: [s(20), s(40), s(60)],
      P2: [s(40), s(80), s(120)],
      P3: standard.thresholdsFor(Priority.P3),
      P4: standard.thresholdsFor(Priority.P4),
    });
  }
  thresholdsFor(priority: Priority): EscalationThresholds {
    return this.thresholds[priority.value];
  }
}
