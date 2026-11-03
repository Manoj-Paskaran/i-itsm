import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  customType,
  index,
  integer,
  numeric,
  pgSequence,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  vector,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { categories, itServices } from './catalog.js';
import { closureReason, escalationLevel, incidentStatus, priority, slaKind } from './enums.js';
import { users } from './users.js';
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });
const instant = (name: string) => timestamp(name, { withTimezone: true });
export const incidentNumberSeq = pgSequence('incident_number_seq');
export const incidents = pgTable(
  'incidents',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    number: text().notNull().unique(),
    title: text().notNull(),
    description: text().notNull(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => itServices.id),
    categoryId: uuid('category_id').references(() => categories.id),
    impact: smallint().notNull(),
    urgency: smallint().notNull(),
    affectedUsers: integer('affected_users').notNull(),
    priority: priority(),
    status: incidentStatus().notNull(),
    assigneeId: uuid('assignee_id').references(() => users.id),
    duplicateOfId: uuid('duplicate_of_id').references((): AnyPgColumn => incidents.id),
    reopenCount: integer('reopen_count').notNull().default(0),
    escalationLevel: escalationLevel('escalation_level').notNull(),
    assignedAt: instant('assigned_at'),
    createdAt: instant('created_at').notNull(),
    updatedAt: instant('updated_at').notNull(),
    version: integer().notNull().default(0),
    resolutionSummary: text('resolution_summary'),
    resolutionRootCause: text('resolution_root_cause'),
    resolutionResolvedBy: uuid('resolution_resolved_by').references(() => users.id),
    resolutionResolvedAt: instant('resolution_resolved_at'),
    feedbackRating: integer('feedback_rating'),
    feedbackComment: text('feedback_comment'),
    feedbackAt: instant('feedback_at'),
    closureReason: closureReason('closure_reason'),
    closureClosedBy: uuid('closure_closed_by').references(() => users.id),
    closureAt: instant('closure_at'),
    slaStartedAt: instant('sla_started_at'),
    slaResponseMs: bigint('sla_response_ms', { mode: 'number' }),
    slaResolutionMs: bigint('sla_resolution_ms', { mode: 'number' }),
    slaWarningRatio: numeric('sla_warning_ratio'),
    slaRespondedAt: instant('sla_responded_at'),
    slaResolvedAt: instant('sla_resolved_at'),
    slaPausedSince: instant('sla_paused_since'),
    slaPausedTotalMs: bigint('sla_paused_total_ms', { mode: 'number' }),
    slaWarned: slaKind('sla_warned').array(),
    slaBreached: slaKind('sla_breached').array(),
    embedding: vector({ dimensions: 384 }),
    search: tsvector().generatedAlwaysAs(sql`to_tsvector('english', title || ' ' || description)`),
  },
  (t) => [
    check('incidents_impact_check', sql`${t.impact} between 1 and 4`),
    check('incidents_urgency_check', sql`${t.urgency} between 1 and 4`),
    index('incidents_status_idx').on(t.status),
    index('incidents_priority_idx').on(t.priority),
    index('incidents_service_id_idx').on(t.serviceId),
    index('incidents_assignee_id_idx').on(t.assigneeId),
    index('incidents_created_at_idx').on(t.createdAt),
    index('incidents_search_idx').using('gin', t.search),
    index('incidents_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);
export const investigationNotes = pgTable(
  'investigation_notes',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id),
    text: text().notNull(),
    at: instant('at').notNull(),
  },
  (t) => [index('investigation_notes_incident_at_idx').on(t.incidentId, t.at)],
);
export const infoRequests = pgTable('info_requests', {
  id: uuid()
    .primaryKey()
    .default(sql`uuidv7()`),
  incidentId: uuid('incident_id')
    .notNull()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  question: text().notNull(),
  askedBy: uuid('asked_by').references(() => users.id),
  askedAt: instant('asked_at').notNull(),
  answer: text(),
  answeredAt: instant('answered_at'),
});
