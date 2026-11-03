import type { DomainEvent } from '../events/domain-event.js';
import { Instant, type AuditId, type UserId, type IncidentId } from '../shared/index.js';
import { text } from '../shared/validation.js';
export interface AuditRecordSnapshot {
  readonly id: AuditId;
  readonly at: string;
  readonly actorId: UserId | null;
  readonly action: string;
  readonly incidentId: IncidentId;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly description: string;
}
export interface AuditRecordProps extends Omit<AuditRecordSnapshot, 'at'> {
  readonly at: Instant;
}
/** Immutable record of an incident action. */
export class AuditRecord {
  private constructor(private readonly snapshot: AuditRecordSnapshot) {}
  static create(p: AuditRecordProps): AuditRecord {
    return new AuditRecord(
      Object.freeze({
        ...p,
        at: p.at.toIso(),
        action: text(p.action, 'action'),
        description: text(p.description, 'description'),
      }),
    );
  }
  static rehydrate(s: AuditRecordSnapshot): AuditRecord {
    return AuditRecord.create({ ...s, at: Instant.fromIso(s.at) });
  }
  toSnapshot(): AuditRecordSnapshot {
    return { ...this.snapshot };
  }
  static fromEvent(event: DomainEvent, id: AuditId): AuditRecord {
    return AuditRecord.create({
      id,
      at: event.occurredAt,
      actorId: event.actorId,
      action: event.type,
      incidentId: event.incidentId,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      description: event.describe(),
    });
  }
}
