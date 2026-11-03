import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { incidents } from './incidents.js';
export const notifications = pgTable(
  'notifications',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    title: text().notNull(),
    body: text().notNull(),
    incidentId: uuid('incident_id').references(() => incidents.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [index('notifications_recipient_created_idx').on(t.recipientId, t.createdAt.desc())],
);
