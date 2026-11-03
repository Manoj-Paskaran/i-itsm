import type { Role } from '../users/enums.js';
import type { EscalationLevel } from './escalation-level.js';
/** Value object describing an escalation decision. */
export class EscalationDecision {
  constructor(
    readonly from: EscalationLevel,
    readonly to: EscalationLevel,
    readonly notifyRole: Role,
    readonly reason: string,
  ) {
    Object.freeze(this);
  }
}
