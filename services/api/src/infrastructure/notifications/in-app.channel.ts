import { NotificationPushSchema } from '@itsm/contracts';
import type { NotificationMessage } from '../../application/notifications/notification-message.js';
import type { NotificationChannel, NotificationRepository } from '../../ports/index.js';
import { RealtimeGateway } from './realtime.gateway.js';
export class InAppChannel implements NotificationChannel {
  readonly kind = 'IN_APP' as const;
  constructor(
    private readonly repository: NotificationRepository,
    private readonly gateway: RealtimeGateway,
  ) {}
  async send(message: NotificationMessage): Promise<void> {
    const { id } = await this.repository.add(message);
    try {
      const notification = {
        id,
        eventType: message.eventType,
        title: message.title,
        body: message.body,
        incident:
          message.incidentId && message.incidentNumber
            ? { id: message.incidentId, number: message.incidentNumber }
            : null,
        createdAt: message.createdAt.toIso(),
        readAt: null,
      };
      this.gateway.pushTo(
        message.recipientId,
        NotificationPushSchema.parse({ type: 'notification', notification }),
      );
    } catch {
      /* persistence succeeds even when realtime delivery fails */
    }
  }
}
