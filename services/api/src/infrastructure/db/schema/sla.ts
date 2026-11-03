import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { itServices } from './catalog.js';
import { priority } from './enums.js';
export const slaPolicies = pgTable(
  'sla_policies',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text().notNull(),
    serviceId: uuid('service_id')
      .references(() => itServices.id)
      .unique(),
    warningRatio: numeric('warning_ratio').notNull(),
  },
  (t) => [
    uniqueIndex('sla_policies_default_unique')
      .on(sql`(1)`)
      .where(sql`${t.serviceId} is null`),
    check('sla_policies_warning_ratio_check', sql`${t.warningRatio} > 0 and ${t.warningRatio} < 1`),
  ],
);
export const slaTargets = pgTable(
  'sla_targets',
  {
    policyId: uuid('policy_id')
      .notNull()
      .references(() => slaPolicies.id, { onDelete: 'cascade' }),
    priority: priority().notNull(),
    responseMs: bigint('response_ms', { mode: 'number' }).notNull(),
    resolutionMs: bigint('resolution_ms', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.policyId, t.priority] }),
    check('sla_targets_order_check', sql`${t.responseMs} <= ${t.resolutionMs}`),
  ],
);
