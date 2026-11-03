import { EscalationDecision } from './escalation-decision.js';
import { escalationRank, escalationRole, type EscalationLevel } from './escalation-level.js';
import type { EscalationPolicy } from './escalation-policy.js';
import type { EscalationRequest } from './escalation-request.js';
import type { Duration } from '../shared/index.js';
/** Abstract handler defining the Chain of Responsibility template method. */
export abstract class EscalationHandler {
  private next?: EscalationHandler;
  setNext(h: EscalationHandler): EscalationHandler {
    this.next = h;
    return h;
  }
  handle(req: EscalationRequest, policy: EscalationPolicy): EscalationDecision | null {
    return this.owns(req, policy)
      ? this.decide(req, policy)
      : (this.next?.handle(req, policy) ?? null);
  }
  protected abstract owns(req: EscalationRequest, policy: EscalationPolicy): boolean;
  protected abstract decide(
    req: EscalationRequest,
    policy: EscalationPolicy,
  ): EscalationDecision | null;
  protected target(
    req: EscalationRequest,
    level: EscalationLevel,
    threshold: Duration,
    label: string,
  ): EscalationDecision | null {
    if (escalationRank(level) <= escalationRank(req.currentLevel)) return null;
    const format = (d: Duration): string =>
      d.ms % 60000 === 0 ? `${d.minutes} min` : `${d.ms / 1000} s`;
    return new EscalationDecision(
      req.currentLevel,
      level,
      escalationRole(level),
      `${req.priority.value} unacknowledged for ${format(req.unacknowledgedFor)} (threshold ${format(threshold)}) → ${label}`,
    );
  }
}
