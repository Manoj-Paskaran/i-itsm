import { describe, expect, it } from 'vitest';
import {
  NotificationListSchema,
  NotificationPushSchema,
  NotificationSchema,
} from './notifications.js';
const notification = {
  id: '00000000-0000-4000-8000-000000000001',
  eventType: 'IncidentAssigned',
  title: 'Assigned',
  body: 'Details',
  incident: null,
  createdAt: '2026-11-03T09:00:00Z',
  readAt: null,
};
describe('notification contracts', () => {
  it('accepts inbox and push messages', () => {
    expect(NotificationListSchema.safeParse({ items: [notification], unread: 1 }).success).toBe(
      true,
    );
    expect(NotificationPushSchema.safeParse({ type: 'notification', notification }).success).toBe(
      true,
    );
  });
  it('rejects invalid identifiers dates and unread counts', () => {
    expect(NotificationSchema.safeParse({ ...notification, id: 'bad' }).success).toBe(false);
    expect(NotificationSchema.safeParse({ ...notification, readAt: 'bad' }).success).toBe(false);
    expect(NotificationListSchema.safeParse({ items: [], unread: -1 }).success).toBe(false);
    expect(NotificationPushSchema.safeParse({ type: 'other', notification }).success).toBe(false);
  });
});
