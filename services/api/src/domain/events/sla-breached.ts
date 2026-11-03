import { EventType } from './event-type.js';
import type { SlaKind } from '../sla/enums.js';
import type { Instant } from '../shared/index.js';
import { DomainEvent, type EventContext } from './domain-event.js';

/** Records a newly crossed SLA deadline without changing incident state. */
export class SlaBreached extends DomainEvent {
  readonly type = EventType.SlaBreached;
  constructor(
    context: EventContext,
    readonly kind: SlaKind,
    readonly deadline: Instant,
  ) {
    super({ ...context, fromStatus: null, toStatus: null });
    Object.freeze(this);
  }
  describe(): string {
    return `Incident ${this.incidentId} ${this.kind} SLA breached deadline ${this.deadline.toIso()}.`;
  }
}
