import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { availability, role } from './enums.js';
import { itServices } from './catalog.js';
export const users = pgTable(
  'users',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text().notNull(),
    email: text().notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: role().notNull(),
    active: boolean().notNull(),
    department: text(),
    maxActiveIncidents: integer('max_active_incidents'),
    availability: availability(),
    experienceYears: integer('experience_years'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('users_email_lowercase_check', sql`${t.email} = lower(${t.email})`)],
);
export const technicianSkills = pgTable(
  'technician_skills',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skill: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skill] })],
);
export const technicianServiceHistory = pgTable(
  'technician_service_history',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => itServices.id),
    resolvedCount: integer('resolved_count').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serviceId] })],
);
export const teamMembers = pgTable(
  'team_members',
  {
    teamLeadId: uuid('team_lead_id')
      .notNull()
      .references(() => users.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    primaryKey({ columns: [t.teamLeadId, t.memberId] }),
    check('team_members_distinct_check', sql`${t.teamLeadId} <> ${t.memberId}`),
  ],
);
