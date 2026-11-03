import { EventType, type EventType as EventTypeValue } from '../../domain/events/index.js';
import type { ChannelKind } from '../../ports/notifications.js';

export type Audience =
  | 'REPORTER'
  | 'ASSIGNEE'
  | 'PREVIOUS_ASSIGNEE'
  | 'TEAM_LEADS_OF_ASSIGNEE'
  | 'ROLE_FROM_EVENT'
  | 'ADMINS';
export interface Route {
  readonly audiences: readonly Audience[];
  readonly channels: readonly ChannelKind[];
}
const inApp: readonly ChannelKind[] = ['IN_APP'];
const both: readonly ChannelKind[] = ['IN_APP', 'EMAIL'];
export const DEFAULT_NOTIFICATION_ROUTES: ReadonlyMap<EventTypeValue, readonly Route[]> = new Map([
  [EventType.IncidentCreated, [{ audiences: ['REPORTER'], channels: inApp }]],
  [
    EventType.IncidentAssigned,
    [
      { audiences: ['ASSIGNEE'], channels: both },
      { audiences: ['REPORTER'], channels: inApp },
    ],
  ],
  [EventType.PriorityChanged, [{ audiences: ['ASSIGNEE'], channels: inApp }]],
  [EventType.InfoRequested, [{ audiences: ['REPORTER'], channels: both }]],
  [EventType.InfoProvided, [{ audiences: ['ASSIGNEE'], channels: inApp }]],
  [
    EventType.SlaWarningRaised,
    [{ audiences: ['ASSIGNEE', 'TEAM_LEADS_OF_ASSIGNEE'], channels: both }],
  ],
  [
    EventType.SlaBreached,
    [{ audiences: ['ASSIGNEE', 'TEAM_LEADS_OF_ASSIGNEE', 'ADMINS'], channels: both }],
  ],
  [EventType.IncidentEscalated, [{ audiences: ['ROLE_FROM_EVENT'], channels: both }]],
  [EventType.IncidentResolved, [{ audiences: ['REPORTER'], channels: both }]],
  [EventType.IncidentReopened, [{ audiences: ['ASSIGNEE'], channels: inApp }]],
  [EventType.IncidentClosed, [{ audiences: ['REPORTER', 'ASSIGNEE'], channels: inApp }]],
]);
export class NotificationRoutingPolicy {
  constructor(
    private readonly routes: ReadonlyMap<
      EventTypeValue,
      readonly Route[]
    > = DEFAULT_NOTIFICATION_ROUTES,
  ) {}
  routesFor(type: EventTypeValue): readonly Route[] {
    return this.routes.get(type) ?? [];
  }
  channelsFor(type: EventTypeValue): readonly ChannelKind[] {
    return [...new Set(this.routesFor(type).flatMap((route) => route.channels))];
  }
}
