import { TechnicianLevelHandler } from './technician-level-handler.js';
import { TeamLeadLevelHandler } from './team-lead-level-handler.js';
import { SysAdminLevelHandler } from './sys-admin-level-handler.js';
import { ItManagerLevelHandler } from './it-manager-level-handler.js';
import type { EscalationHandler } from './escalation-handler.js';
/** Factory assembling the escalation Chain of Responsibility. */
export class EscalationChainFactory {
  static create(): EscalationHandler {
    const head = new TechnicianLevelHandler();
    head
      .setNext(new TeamLeadLevelHandler())
      .setNext(new SysAdminLevelHandler())
      .setNext(new ItManagerLevelHandler());
    return head;
  }
}
