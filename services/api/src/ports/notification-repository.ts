import type { Notification } from '@itsm/contracts';
import type { UserId } from '../domain/shared/index.js';
import type { NotificationMessage } from '../application/notifications/notification-message.js';
export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');
export interface NotificationRepository {
  add(message: NotificationMessage): Promise<{ id: string }>;
  listFor(userId: UserId, limit: number): Promise<Notification[]>;
  unreadCount(userId: UserId): Promise<number>;
  markRead(userId: UserId, id: string): Promise<boolean>;
  markAllRead(userId: UserId): Promise<void>;
}
