import type { NotificationMessage } from '../application/notifications/notification-message.js';

export type ChannelKind = 'IN_APP' | 'EMAIL';
export interface NotificationChannel {
  readonly kind: ChannelKind;
  send(message: NotificationMessage): Promise<void>;
}
