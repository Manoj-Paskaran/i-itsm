import { EscalationHandler } from './escalation-handler.js';
import type { EscalationRequest } from './escalation-request.js';
import type { EscalationPolicy } from './escalation-policy.js';
import type { EscalationDecision } from './escalation-decision.js';
import { EscalationLevel } from './escalation-level.js';
/** Concrete Chain of Responsibility handler for the TeamLead band. */
export class TeamLeadLevelHandler extends EscalationHandler {
  protected owns(req: EscalationRequest, policy: EscalationPolicy): boolean {
    return req.unacknowledgedFor.compare(policy.thresholdsFor(req.priority)[1]) < 0;
  }
  protected decide(req: EscalationRequest, policy: EscalationPolicy): EscalationDecision | null {
    return this.target(
      req,
      EscalationLevel.TEAM_LEAD,
      policy.thresholdsFor(req.priority)[0],
      'Team Lead',
    );
  }
}
