import { EscalationHandler } from './escalation-handler.js';
import type { EscalationRequest } from './escalation-request.js';
import type { EscalationPolicy } from './escalation-policy.js';
import type { EscalationDecision } from './escalation-decision.js';
import { EscalationLevel } from './escalation-level.js';
/** Concrete Chain of Responsibility handler for the ItManager band. */
export class ItManagerLevelHandler extends EscalationHandler {
  protected owns(): boolean {
    return true;
  }
  protected decide(req: EscalationRequest, policy: EscalationPolicy): EscalationDecision | null {
    return this.target(
      req,
      EscalationLevel.IT_MANAGER,
      policy.thresholdsFor(req.priority)[2],
      'IT Manager',
    );
  }
}
