import { EventType } from './event-type.js';
import type { SlaKind } from '../sla/enums.js';
import type { Instant } from '../shared/index.js';
import { DomainEvent, type EventContext } from './domain-event.js';

/** Records a newly crossed warning point without changing incident state. */
export class SlaWarningRaised extends DomainEvent {
  readonly type = EventType.SlaWarningRaised;
  constructor(
    context: EventContext,
    readonly kind: SlaKind,
    readonly deadline: Instant,
  ) {
    super({ ...context, fromStatus: null, toStatus: null });
    Object.freeze(this);
  }
  describe(): string {
    return `Incident ${this.incidentId} ${this.kind} SLA approaching deadline ${this.deadline.toIso()}.`;
  }
}
