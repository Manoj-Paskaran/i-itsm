import { EscalationLevel } from '../escalation/escalation-level.js';
import type { IncidentSnapshot } from '../incidents/snapshot.js';
import { Instant, type PriorityCode } from '../shared/index.js';
import { SlaClock } from '../sla/index.js';

export type SlaRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
/** The facts the rule-based estimate (and the ML model) look at. */
export interface SlaRiskFactors {
  readonly priority: PriorityCode | null;
  /** Share of the resolution window already used, pauses excluded; 1 means the deadline is now. */
  readonly elapsedFraction: number;
  readonly minutesOpen: number;
  readonly minutesToDeadline: number;
  readonly paused: boolean;
  readonly escalationLevel: EscalationLevel;
  readonly unassigned: boolean;
}
export interface SlaRiskEstimate {
  readonly probability: number;
  readonly level: SlaRiskLevel;
  readonly reasons: readonly string[];
}

const PRIORITY_WEIGHT: Record<PriorityCode, number> = { P1: 0.15, P2: 0.1, P3: 0.05, P4: 0 };
const ESCALATED_WEIGHT = 0.1;
const UNASSIGNED_WEIGHT = 0.1;
const PAUSED_FACTOR = 0.5;
const DONE = new Set(['RESOLVED', 'VERIFIED', 'CLOSED']);
const MINUTE = 60000;

/**
 * Domain policy for IF-E / INV-4: an explainable estimate of how likely an incident is to miss
 * its resolution SLA. Starts from how much of the window is used, then adds weight for a tight
 * priority, escalation and no owner, and halves it while the clock is paused waiting for info.
 * It is advisory only and is the fallback whenever the ML model is unavailable.
 */
export class SlaRiskPolicy {
  static readonly HIGH = 0.7;
  static readonly MEDIUM = 0.4;

  static levelOf(probability: number): SlaRiskLevel {
    if (probability >= SlaRiskPolicy.HIGH) return 'HIGH';
    if (probability >= SlaRiskPolicy.MEDIUM) return 'MEDIUM';
    return 'LOW';
  }

  /** Null when there is nothing to predict: no SLA yet, or the incident is already resolved. */
  static factors(s: IncidentSnapshot, now: Instant): SlaRiskFactors | null {
    if (!s.slaClock || DONE.has(s.status)) return null;
    const clock = SlaClock.rehydrate(s.slaClock);
    const window = s.slaClock.target.resolution;
    // Raw ms: past the deadline this goes negative, which a Duration would reject.
    const remaining = clock.resolutionDeadline(now).ms - now.ms;
    const started = Instant.fromIso(s.slaClock.startedAt);
    return {
      priority: s.priority,
      elapsedFraction: Math.max(0, 1 - remaining / window),
      minutesOpen: Math.max(0, started.until(now).ms / MINUTE),
      minutesToDeadline: remaining / MINUTE,
      paused: s.slaClock.pausedSince !== null,
      escalationLevel: s.escalationLevel,
      unassigned: s.assigneeId === null,
    };
  }

  /** The human-readable "why" behind a risk, shared by the rule estimate and the model's. */
  static reasons(f: SlaRiskFactors): string[] {
    const used = Math.round(f.elapsedFraction * 100);
    return [
      f.elapsedFraction >= 1
        ? 'resolution deadline already passed'
        : `${used}% of the resolution window used`,
      ...(f.priority === 'P1' || f.priority === 'P2' ? [`${f.priority} has a tight window`] : []),
      ...(f.escalationLevel !== EscalationLevel.TECHNICIAN ? ['already escalated'] : []),
      ...(f.unassigned ? ['nobody assigned yet'] : []),
      ...(f.paused ? ['clock paused while waiting for information'] : []),
    ];
  }

  estimate(f: SlaRiskFactors): SlaRiskEstimate {
    const reasons = SlaRiskPolicy.reasons(f);
    if (f.elapsedFraction >= 1) return { probability: 1, level: 'HIGH', reasons };
    let p = f.elapsedFraction;
    if (f.priority) p += PRIORITY_WEIGHT[f.priority];
    if (f.escalationLevel !== EscalationLevel.TECHNICIAN) p += ESCALATED_WEIGHT;
    if (f.unassigned) p += UNASSIGNED_WEIGHT;
    if (f.paused) p *= PAUSED_FACTOR;
    const probability = Math.round(Math.min(0.99, Math.max(0.01, p)) * 100) / 100;
    return { probability, level: SlaRiskPolicy.levelOf(probability), reasons };
  }
}
