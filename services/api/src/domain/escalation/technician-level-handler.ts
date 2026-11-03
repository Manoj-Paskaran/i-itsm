import { EscalationHandler } from './escalation-handler.js';
import type { EscalationRequest } from './escalation-request.js';
import type { EscalationPolicy } from './escalation-policy.js';
import type { EscalationDecision } from './escalation-decision.js';
/** Concrete Chain of Responsibility handler for the Technician band. */
export class TechnicianLevelHandler extends EscalationHandler {
  protected owns(req: EscalationRequest, policy: EscalationPolicy): boolean {
    return req.unacknowledgedFor.compare(policy.thresholdsFor(req.priority)[0]) < 0;
  }
  protected decide(): EscalationDecision | null {
    return null;
  }
}
