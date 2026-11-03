import { InvalidInputException } from '../exceptions/index.js';
import { Duration, Instant } from '../shared/index.js';
import { SlaKind, SlaStatus } from './enums.js';
import { SlaTarget, type SlaTargetSnapshot } from './sla-target.js';
import { validateWarningRatio } from './validation.js';

export interface SlaClockSnapshot {
  readonly startedAt: string;
  readonly target: SlaTargetSnapshot;
  readonly warningRatio: number;
  readonly respondedAt: string | null;
  readonly resolvedAt: string | null;
  readonly pausedSince: string | null;
  readonly pausedTotal: number;
  readonly warned: readonly SlaKind[];
  readonly breached: readonly SlaKind[];
}

export interface SlaCrossing {
  readonly kind: SlaKind;
  readonly what: 'WARNING' | 'BREACH';
}

const severity: Record<SlaStatus, number> = {
  MET: 0,
  ON_TRACK: 1,
  PAUSED: 2,
  AT_RISK: 3,
  BREACHED: 4,
};

/** Incident-owned clock that tracks completion, resolution pauses and emitted SLA crossings. */
export class SlaClock {
  private respondedAt: Instant | undefined;
  private resolvedAt: Instant | undefined;
  private pausedSince: Instant | undefined;
  private pausedTotal = Duration.ofMs(0);
  private readonly warned = new Set<SlaKind>();
  private readonly breached = new Set<SlaKind>();
  private warningRatio: number;

  constructor(
    private readonly startedAt: Instant,
    private target: SlaTarget,
    warningRatio = 0.75,
  ) {
    this.warningRatio = validateWarningRatio(warningRatio);
  }

  responseDeadline(): Instant {
    return this.startedAt.plus(this.target.response);
  }

  resolutionDeadline(now?: Instant): Instant {
    const pending = this.pausedSince && now ? this.pausedSince.until(now) : Duration.ofMs(0);
    return this.startedAt.plus(this.target.resolution).plus(this.pausedTotal).plus(pending);
  }

  warningAt(kind: SlaKind): Instant {
    const window = kind === SlaKind.RESPONSE ? this.target.response : this.target.resolution;
    // Instants have millisecond precision: warn at the first millisecond at or beyond the ratio.
    const warning = this.startedAt.plus(Duration.ofMs(Math.ceil(window.ms * this.warningRatio)));
    return kind === SlaKind.RESPONSE ? warning : warning.plus(this.pausedTotal);
  }

  recordResponse(at: Instant): void {
    this.respondedAt ??= at;
  }

  recordResolution(at: Instant): void {
    this.resolvedAt = at;
  }

  clearResolution(at: Instant): void {
    if (!this.resolvedAt) return;
    this.pausedTotal = this.pausedTotal.plus(this.resolvedAt.until(at));
    this.resolvedAt = undefined;
  }

  pause(at: Instant): void {
    if (this.pausedSince)
      throw new InvalidInputException('SLA resolution clock is already paused.', {});
    this.pausedSince = at;
  }

  resume(at: Instant): void {
    if (!this.pausedSince)
      throw new InvalidInputException('SLA resolution clock is not paused.', {});
    this.pausedTotal = this.pausedTotal.plus(this.pausedSince.until(at));
    this.pausedSince = undefined;
  }

  retarget(target: SlaTarget, warningRatio: number): void {
    const ratio = validateWarningRatio(warningRatio);
    this.target = target;
    this.warningRatio = ratio;
  }

  status(kind: SlaKind, now: Instant): SlaStatus {
    const response = kind === SlaKind.RESPONSE;
    const deadline = response ? this.responseDeadline() : this.resolutionDeadline(now);
    const completed = response ? this.respondedAt : this.resolvedAt;
    if (completed) return completed.isAfter(deadline) ? SlaStatus.BREACHED : SlaStatus.MET;
    if (!response && this.pausedSince)
      return this.breached.has(kind) ? SlaStatus.BREACHED : SlaStatus.PAUSED;
    if (now.isAfter(deadline)) return SlaStatus.BREACHED;
    return now.compare(this.warningAt(kind)) >= 0 ? SlaStatus.AT_RISK : SlaStatus.ON_TRACK;
  }

  overall(now: Instant): SlaStatus {
    const response = this.status(SlaKind.RESPONSE, now);
    const resolution = this.status(SlaKind.RESOLUTION, now);
    return severity[response] >= severity[resolution] ? response : resolution;
  }

  check(now: Instant): SlaCrossing[] {
    const crossings: SlaCrossing[] = [];
    for (const kind of [SlaKind.RESPONSE, SlaKind.RESOLUTION]) {
      const status = this.status(kind, now);
      if (status === SlaStatus.BREACHED && !this.breached.has(kind)) {
        this.warned.add(kind);
        this.breached.add(kind);
        crossings.push({ kind, what: 'BREACH' });
      } else if (
        status === SlaStatus.AT_RISK &&
        !this.warned.has(kind) &&
        !this.breached.has(kind)
      ) {
        this.warned.add(kind);
        crossings.push({ kind, what: 'WARNING' });
      }
    }
    return crossings;
  }

  toSnapshot(): SlaClockSnapshot {
    return {
      startedAt: this.startedAt.toIso(),
      target: this.target.toSnapshot(),
      warningRatio: this.warningRatio,
      respondedAt: this.respondedAt?.toIso() ?? null,
      resolvedAt: this.resolvedAt?.toIso() ?? null,
      pausedSince: this.pausedSince?.toIso() ?? null,
      pausedTotal: this.pausedTotal.ms,
      warned: [...this.warned],
      breached: [...this.breached],
    };
  }

  static rehydrate(s: SlaClockSnapshot): SlaClock {
    const clock = new SlaClock(
      Instant.fromIso(s.startedAt),
      SlaTarget.rehydrate(s.target),
      s.warningRatio,
    );
    clock.respondedAt = s.respondedAt === null ? undefined : Instant.fromIso(s.respondedAt);
    clock.resolvedAt = s.resolvedAt === null ? undefined : Instant.fromIso(s.resolvedAt);
    clock.pausedSince = s.pausedSince === null ? undefined : Instant.fromIso(s.pausedSince);
    clock.pausedTotal = Duration.ofMs(s.pausedTotal);
    for (const kind of s.warned) clock.warned.add(kind);
    for (const kind of s.breached) {
      clock.warned.add(kind);
      clock.breached.add(kind);
    }
    return clock;
  }
}
