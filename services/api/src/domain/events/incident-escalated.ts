import { EventType } from './event-type.js';
import type { EscalationLevel } from '../escalation/escalation-level.js';
import type { Role } from '../users/enums.js';
import { DomainEvent, type EventContext } from './domain-event.js';
/** Domain event recording a chain escalation without a state transition. */
export class IncidentEscalated extends DomainEvent {
  readonly type = EventType.IncidentEscalated;
  constructor(
    context: EventContext,
    readonly from: EscalationLevel,
    readonly to: EscalationLevel,
    readonly notifyRole: Role,
    readonly reason: string,
  ) {
    super({ ...context, fromStatus: null, toStatus: null });
    Object.freeze(this);
  }
  describe(): string {
    return this.reason;
  }
}
