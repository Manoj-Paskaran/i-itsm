import type { EscalationLevel } from '../escalation/escalation-level.js';
import type { CategoryId, IncidentId, ItServiceId, PriorityCode, UserId } from '../shared/index.js';
import type { IncidentStatus } from './state/index.js';
import type { InfoRequestSnapshot } from './info-request.js';
import type { ClosureReason } from './closure-info.js';
import type { SlaClockSnapshot } from '../sla/index.js';

/** Plain, serialisable persistence boundary. No events or mutable domain objects. */
export interface IncidentSnapshot {
  readonly id: IncidentId;
  readonly number: string;
  readonly title: string;
  readonly description: string;
  readonly reporterId: UserId;
  readonly serviceId: ItServiceId;
  readonly categoryId: CategoryId | null;
  readonly impact: number;
  readonly urgency: number;
  readonly affectedUsers: number;
  readonly priority: PriorityCode | null;
  readonly status: IncidentStatus;
  readonly assigneeId: UserId | null;
  readonly escalationLevel: EscalationLevel;
  readonly assignedAt: string | null;
  readonly duplicateOfId: IncidentId | null;
  readonly createdAt: string;
  readonly notes: ReadonlyArray<{
    readonly authorId: UserId | null;
    readonly text: string;
    readonly at: string;
  }>;
  readonly infoRequests: ReadonlyArray<InfoRequestSnapshot>;
  readonly resolution: {
    readonly summary: string;
    readonly rootCause?: string;
    readonly resolvedBy: UserId | null;
    readonly at: string;
  } | null;
  readonly feedback: {
    readonly rating: number;
    readonly comment?: string;
    readonly at: string;
  } | null;
  readonly closure: {
    readonly reason: ClosureReason;
    readonly closedBy: UserId | null;
    readonly at: string;
    readonly duplicateOfId?: IncidentId;
  } | null;
  readonly reopenCount: number;
  readonly slaClock: SlaClockSnapshot | null;
}
