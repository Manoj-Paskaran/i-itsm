/* eslint-disable @typescript-eslint/require-await */
import { randomUUID } from 'node:crypto';
import type { Notification } from '@itsm/contracts';
import type { NotificationMessage } from '../notifications/notification-message.js';
import type { UserId } from '../../domain/shared/index.js';
import type { NotificationRepository } from '../../ports/index.js';
export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly rows: { userId: UserId; notification: Notification }[] = [];
  async add(m: NotificationMessage) {
    const id = randomUUID();
    this.rows.push({
      userId: m.recipientId,
      notification: {
        id,
        eventType: m.eventType,
        title: m.title,
        body: m.body,
        incident:
          m.incidentId && m.incidentNumber ? { id: m.incidentId, number: m.incidentNumber } : null,
        createdAt: m.createdAt.toIso(),
        readAt: null,
      },
    });
    return { id };
  }
  async listFor(userId: UserId, limit: number) {
    return this.rows
      .filter((r) => r.userId === userId)
      .map((r) => r.notification)
      .reverse()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  async unreadCount(userId: UserId) {
    return this.rows.filter((r) => r.userId === userId && !r.notification.readAt).length;
  }
  async markRead(userId: UserId, id: string) {
    const row = this.rows.find((r) => r.userId === userId && r.notification.id === id);
    if (!row) return false;
    row.notification.readAt = new Date().toISOString();
    return true;
  }
  async markAllRead(userId: UserId) {
    for (const row of this.rows)
      if (row.userId === userId && !row.notification.readAt)
        row.notification.readAt = new Date().toISOString();
  }
}
