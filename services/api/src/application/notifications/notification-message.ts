import type { EventType } from '../../domain/events/index.js';
import type { IncidentId, Instant, UserId } from '../../domain/shared/index.js';

export interface NotificationMessage {
  readonly recipientId: UserId;
  readonly recipientName: string;
  readonly recipientEmail: string;
  readonly eventType: EventType;
  readonly title: string;
  readonly body: string;
  readonly incidentId: IncidentId | null;
  readonly incidentNumber: string | null;
  readonly incidentTitle?: string;
  readonly actorName?: string;
  readonly resolutionSummary?: string;
  readonly rootCause?: string;
  readonly question?: string;
  readonly createdAt: Instant;
}
