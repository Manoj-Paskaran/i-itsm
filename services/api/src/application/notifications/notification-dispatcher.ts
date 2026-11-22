import {
  IncidentAssigned,
  IncidentEscalated,
  PriorityChanged,
  type DomainEvent,
  type EventType,
} from '../../domain/events/index.js';
import { Role, TeamLead, type User } from '../../domain/users/index.js';
import type { UserId } from '../../domain/shared/index.js';
import type {
  EventSubscriber,
  IncidentRepository,
  UserRepository,
  NotificationChannel,
  ChannelKind,
} from '../../ports/index.js';
import { NotificationFactory } from './notification-factory.js';
import { NotificationRoutingPolicy, type Audience } from './notification-routing-policy.js';

export class NotificationDispatcher implements EventSubscriber {
  readonly name = 'NotificationDispatcher';
  constructor(
    private readonly incidents: IncidentRepository,
    private readonly users: UserRepository,
    private readonly channels: readonly NotificationChannel[],
    private readonly policy = new NotificationRoutingPolicy(),
    private readonly factory = new NotificationFactory(),
  ) {}
  handles(type: EventType): boolean {
    return this.policy.routesFor(type).length > 0;
  }
  async on(event: DomainEvent): Promise<void> {
    // The first priority is set during classification, before anyone is assigned: not a "change".
    if (event instanceof PriorityChanged && event.from === null) return;
    const routes = this.policy.routesFor(event.type);
    if (!routes.length) return;
    const incident = await this.incidents.findById(event.incidentId);
    const assignee =
      event instanceof IncidentAssigned ? event.technicianId : (incident?.assigneeId() ?? null);
    const find = async (id: UserId | null | undefined): Promise<User[]> => {
      const user = id ? await this.users.findById(id) : null;
      return user ? [user] : [];
    };
    const resolve = async (audience: Audience): Promise<User[]> => {
      switch (audience) {
        case 'REPORTER':
          return find(incident?.reporterId());
        case 'ASSIGNEE':
          return find(assignee);
        case 'PREVIOUS_ASSIGNEE':
          return find(event instanceof IncidentAssigned ? event.previousTechnicianId : null);
        case 'TEAM_LEADS_OF_ASSIGNEE':
          return assignee
            ? (await this.users.listTechnicians()).filter(
                (user) => user instanceof TeamLead && user.supervises(assignee),
              )
            : [];
        case 'ROLE_FROM_EVENT':
          return event instanceof IncidentEscalated ? this.users.listByRole(event.notifyRole) : [];
        case 'ADMINS':
          return this.users.listByRole(Role.ADMIN);
      }
    };
    const recipients = new Map<UserId, { user: User; channels: Set<ChannelKind> }>();
    for (const route of routes)
      for (const audience of route.audiences)
        for (const user of await resolve(audience)) {
          if (!user.isActive() || user.id() === event.actorId) continue;
          const entry = recipients.get(user.id()) ?? { user, channels: new Set<ChannelKind>() };
          for (const channel of route.channels) entry.channels.add(channel);
          recipients.set(user.id(), entry);
        }
    const actor = event.actorId ? await this.users.findById(event.actorId) : null;
    const snapshot = incident?.toSnapshot();
    const messages = this.factory.create(
      event,
      [...recipients.values()].map((entry) => entry.user),
      snapshot
        ? {
            id: incident!.id,
            number: snapshot.number,
            title: snapshot.title,
            ...(snapshot.resolution ? { resolution: snapshot.resolution } : {}),
          }
        : null,
      actor?.name(),
    );
    const errors: unknown[] = [];
    for (const message of messages)
      for (const channel of this.channels)
        if (recipients.get(message.recipientId)!.channels.has(channel.kind)) {
          try {
            await channel.send(message);
          } catch (error) {
            errors.push(error);
          }
        }
    if (errors.length) throw new AggregateError(errors, 'Notification delivery failed');
  }
}
