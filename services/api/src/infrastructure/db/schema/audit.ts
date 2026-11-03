import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { incidents } from './incidents.js';
import { users } from './users.js';
export const auditRecords = pgTable(
  'audit_records',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    at: timestamp({ withTimezone: true }).notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    action: text().notNull(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    description: text().notNull(),
  },
  (t) => [index('audit_records_incident_at_idx').on(t.incidentId, t.at)],
);
