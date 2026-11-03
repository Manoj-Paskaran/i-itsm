import { EventType } from './event-type.js';
import type {
  IncidentId,
  IncidentNumber,
  UserId,
  ItServiceId,
  CategoryId,
  Priority,
  Rating,
} from '../shared/index.js';
import { DomainEvent, type EventContext } from './domain-event.js';

export class IncidentCreated extends DomainEvent {
  readonly type = EventType.IncidentCreated;
  constructor(
    context: EventContext,
    readonly number: IncidentNumber,
    readonly reporterId: UserId,
    readonly serviceId: ItServiceId,
  ) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Incident ${this.number.value} reported by ${this.reporterId} for service ${this.serviceId}.`;
  }
}

export class IncidentClassified extends DomainEvent {
  readonly type = EventType.IncidentClassified;
  constructor(
    context: EventContext,
    readonly categoryId: CategoryId,
  ) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Incident ${this.incidentId} classified as ${this.categoryId}.`;
  }
}

export class PriorityChanged extends DomainEvent {
  readonly type = EventType.PriorityChanged;
  constructor(
    context: EventContext,
    readonly from: Priority | null,
    readonly to: Priority,
  ) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Incident ${this.incidentId} priority changed from ${this.from?.value ?? 'unassigned'} to ${this.to.value}.`;
  }
}

export class IncidentAssigned extends DomainEvent {
  readonly type = EventType.IncidentAssigned;
  constructor(
    context: EventContext,
    readonly technicianId: UserId,
    readonly previousTechnicianId: UserId | null,
  ) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Incident ${this.incidentId} assigned to ${this.technicianId}.`;
  }
}

export class IncidentAcknowledged extends DomainEvent {
  readonly type = EventType.IncidentAcknowledged;
  constructor(context: EventContext) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Incident ${this.incidentId} acknowledged.`;
  }
}

export class WorkStarted extends DomainEvent {
  readonly type = EventType.WorkStarted;
  constructor(context: EventContext) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Work started on incident ${this.incidentId}.`;
  }
}

export class NoteAdded extends DomainEvent {
  readonly type = EventType.NoteAdded;
  constructor(
    context: EventContext,
    readonly noteText: string,
  ) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Note added to incident ${this.incidentId}: ${this.noteText}`;
  }
}

export class InfoRequested extends DomainEvent {
  readonly type = EventType.InfoRequested;
  constructor(
    context: EventContext,
    readonly question: string,
  ) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Information requested for incident ${this.incidentId}: ${this.question}`;
  }
}

export class InfoProvided extends DomainEvent {
  readonly type = EventType.InfoProvided;
  constructor(
    context: EventContext,
    readonly answer: string,
  ) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Information provided for incident ${this.incidentId}: ${this.answer}`;
  }
}

export class IncidentResolved extends DomainEvent {
  readonly type = EventType.IncidentResolved;
  constructor(
    context: EventContext,
    readonly summary: string,
  ) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Incident ${this.incidentId} resolved: ${this.summary}`;
  }
}

export class IncidentVerified extends DomainEvent {
  readonly type = EventType.IncidentVerified;
  constructor(context: EventContext) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Resolution verified for incident ${this.incidentId}.`;
  }
}

export class IncidentReopened extends DomainEvent {
  readonly type = EventType.IncidentReopened;
  constructor(
    context: EventContext,
    readonly reason: string,
    readonly reopenCount: number,
  ) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Incident ${this.incidentId} reopened (count ${this.reopenCount}): ${this.reason}`;
  }
}

export class IncidentClosed extends DomainEvent {
  readonly type = EventType.IncidentClosed;
  constructor(
    context: EventContext,
    readonly reason: 'RESOLVED' | 'DUPLICATE',
    readonly duplicateOfId: IncidentId | null,
  ) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Incident ${this.incidentId} closed: ${this.reason}${this.duplicateOfId === null ? '' : ` of ${this.duplicateOfId}`}.`;
  }
}

export class FeedbackGiven extends DomainEvent {
  readonly type = EventType.FeedbackGiven;
  constructor(
    context: EventContext,
    readonly rating: Rating,
  ) {
    super(context);
    Object.freeze(this);
  }
  describe(): string {
    return `Feedback recorded for incident ${this.incidentId}: ${this.rating.value} out of 5.`;
  }
}
