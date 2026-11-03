import { z } from 'zod';

export const NotificationSchema = z.object({
  id: z.uuid(),
  eventType: z.string(),
  title: z.string(),
  body: z.string(),
  incident: z.object({ id: z.uuid(), number: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});
export const NotificationListSchema = z.object({
  items: z.array(NotificationSchema),
  unread: z.int().nonnegative(),
});
export const NotificationPushSchema = z.object({
  type: z.literal('notification'),
  notification: NotificationSchema,
});
export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationList = z.infer<typeof NotificationListSchema>;
export type NotificationPush = z.infer<typeof NotificationPushSchema>;
