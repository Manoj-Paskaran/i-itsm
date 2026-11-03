import { pgEnum } from 'drizzle-orm/pg-core';

export const role = pgEnum('role', ['EMPLOYEE', 'TECHNICIAN', 'TEAM_LEAD', 'ADMIN', 'IT_MANAGER']);
export const availability = pgEnum('availability', ['AVAILABLE', 'BUSY', 'OFF_SHIFT', 'ON_LEAVE']);
export const incidentStatus = pgEnum('incident_status', [
  'NEW',
  'CLASSIFIED',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'PENDING_INFO',
  'RESOLVED',
  'VERIFIED',
  'CLOSED',
  'REOPENED',
]);
export const priority = pgEnum('priority', ['P1', 'P2', 'P3', 'P4']);
export const slaKind = pgEnum('sla_kind', ['RESPONSE', 'RESOLUTION']);
export const closureReason = pgEnum('closure_reason', ['RESOLVED', 'DUPLICATE']);
export const escalationLevel = pgEnum('escalation_level', [
  'TECHNICIAN',
  'TEAM_LEAD',
  'SYS_ADMIN',
  'IT_MANAGER',
]);
