import {
  EventType,
  IncidentAssigned,
  IncidentEscalated,
  SlaBreached,
  SlaWarningRaised,
  InfoRequested,
  InfoProvided,
  IncidentResolved,
  IncidentReopened,
  PriorityChanged,
  type DomainEvent,
} from '../../domain/events/index.js';
import type { IncidentId } from '../../domain/shared/index.js';
import type { User } from '../../domain/users/index.js';
import type { NotificationMessage } from './notification-message.js';

export interface NotificationIncident {
  readonly id: IncidentId;
  readonly number: string;
  readonly title: string;
}
function roleLabel(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}
export class NotificationFactory {
  create(
    event: DomainEvent,
    recipients: readonly User[],
    incident: NotificationIncident | null,
  ): NotificationMessage[] {
    const number = incident?.number ?? 'Incident';
    const details = incident?.title ?? '';
    return [...new Map(recipients.map((user) => [user.id(), user])).values()].map((user) => {
      let title: string;
      let body = details;
      switch (event.type) {
        case EventType.IncidentCreated:
          title = `${number} created`;
          break;
        case EventType.IncidentAssigned:
          title =
            event instanceof IncidentAssigned && user.id() === event.technicianId
              ? `${number} assigned to you`
              : `${number} assigned`;
          break;
        case EventType.PriorityChanged:
          title = `${number} priority changed`;
          if (event instanceof PriorityChanged) body = `${event.to.value} · ${details}`;
          break;
        case EventType.InfoRequested:
          title = `Information requested for ${number}`;
          if (event instanceof InfoRequested) body = event.question;
          break;
        case EventType.InfoProvided:
          title = `Information provided for ${number}`;
          if (event instanceof InfoProvided) body = event.answer;
          break;
        case EventType.SlaWarningRaised:
          title = `SLA approaching on ${number}${event instanceof SlaWarningRaised ? ` (${event.kind.toLowerCase()})` : ''}`;
          break;
        case EventType.SlaBreached:
          title = `SLA breached on ${number}${event instanceof SlaBreached ? ` (${event.kind.toLowerCase()})` : ''}`;
          break;
        case EventType.IncidentEscalated:
          title = `${number} escalated${event instanceof IncidentEscalated ? ` to ${roleLabel(event.notifyRole)}` : ''}`;
          if (event instanceof IncidentEscalated) body = event.reason;
          break;
        case EventType.IncidentResolved:
          title = `${number} resolved`;
          if (event instanceof IncidentResolved) body = event.summary;
          break;
        case EventType.IncidentReopened:
          title = `${number} reopened`;
          if (event instanceof IncidentReopened) body = event.reason;
          break;
        case EventType.IncidentClosed:
          title = `${number} closed`;
          break;
        default:
          title = `${number} updated`;
      }
      return {
        recipientId: user.id(),
        recipientName: user.name(),
        recipientEmail: user.email().value,
        eventType: event.type,
        title,
        body,
        incidentId: incident?.id ?? null,
        incidentNumber: incident?.number ?? null,
        createdAt: event.occurredAt,
      };
    });
  }
}
