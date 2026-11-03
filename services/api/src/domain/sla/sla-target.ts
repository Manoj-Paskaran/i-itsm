import { InvalidInputException } from '../exceptions/index.js';
import { Duration } from '../shared/index.js';

export interface SlaTargetSnapshot {
  readonly response: number;
  readonly resolution: number;
}

/** Immutable positive response and resolution windows, ordered from shorter to longer. */
export class SlaTarget {
  private constructor(
    readonly response: Duration,
    readonly resolution: Duration,
  ) {
    Object.freeze(this);
  }

  static of(response: Duration, resolution: Duration): SlaTarget {
    if (response.ms <= 0 || resolution.ms <= 0 || response.ms > resolution.ms)
      throw new InvalidInputException('SLA windows must satisfy 0 < response <= resolution.', {
        response: response.ms,
        resolution: resolution.ms,
      });
    return new SlaTarget(response, resolution);
  }

  toSnapshot(): SlaTargetSnapshot {
    return { response: this.response.ms, resolution: this.resolution.ms };
  }

  static rehydrate(s: SlaTargetSnapshot): SlaTarget {
    return SlaTarget.of(Duration.ofMs(s.response), Duration.ofMs(s.resolution));
  }
}
