import type { EventType } from './event-type.js';
import type { IncidentId, Instant, UserId } from '../shared/index.js';
import type { IncidentStatus } from '../incidents/state/incident-status.js';

export interface EventContext {
  readonly incidentId: IncidentId;
  readonly actorId: UserId | null;
  readonly occurredAt: Instant;
  readonly fromStatus: IncidentStatus | null;
  readonly toStatus: IncidentStatus | null;
}
/** Events are recorded by the aggregate; publishing belongs to the application layer. */
export abstract class DomainEvent implements EventContext {
  abstract readonly type: EventType;
  readonly incidentId: IncidentId;
  readonly actorId: UserId | null;
  readonly occurredAt: Instant;
  readonly fromStatus: IncidentStatus | null;
  readonly toStatus: IncidentStatus | null;
  protected constructor(context: EventContext) {
    this.incidentId = context.incidentId;
    this.actorId = context.actorId;
    this.occurredAt = context.occurredAt;
    this.fromStatus = context.fromStatus;
    this.toStatus = context.toStatus;
  }
  abstract describe(): string;
}
