import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { NotificationMessage } from '../../../application/notifications/notification-message.js';
import type { UserId } from '../../../domain/shared/index.js';
import type { NotificationRepository } from '../../../ports/index.js';
import { DB, type Database } from '../database.js';
import { incidents, notifications } from '../schema/index.js';
@Injectable()
export class DrizzleNotificationRepository implements NotificationRepository {
  constructor(@Inject(DB) private readonly db: Database) {}
  async add(m: NotificationMessage) {
    const [row] = await this.db
      .insert(notifications)
      .values({
        recipientId: m.recipientId,
        eventType: m.eventType,
        title: m.title,
        body: m.body,
        incidentId: m.incidentId,
        createdAt: m.createdAt.toDate(),
      })
      .returning({ id: notifications.id });
    return { id: row!.id };
  }
  async listFor(userId: UserId, limit: number) {
    const rows = await this.db
      .select({ n: notifications, number: incidents.number })
      .from(notifications)
      .leftJoin(incidents, eq(notifications.incidentId, incidents.id))
      .where(eq(notifications.recipientId, userId))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit);
    return rows.map(({ n, number }) => ({
      id: n.id,
      eventType: n.eventType,
      title: n.title,
      body: n.body,
      incident: n.incidentId && number ? { id: n.incidentId, number } : null,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt?.toISOString() ?? null,
    }));
  }
  async unreadCount(userId: UserId) {
    const [row] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)));
    return row!.value;
  }
  async markRead(userId: UserId, id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;
    const rows = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.recipientId, userId), eq(notifications.id, id)))
      .returning({ id: notifications.id });
    return rows.length > 0;
  }
  async markAllRead(userId: UserId) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)));
  }
}
