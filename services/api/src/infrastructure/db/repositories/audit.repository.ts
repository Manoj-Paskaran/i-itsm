import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { AuditRecord } from '../../../domain/audit/index.js';
import { DatabaseFailureException } from '../../../domain/exceptions/index.js';
import {
  asAuditId,
  asIncidentId,
  asUserId,
  type IncidentId,
} from '../../../domain/shared/index.js';
import type { AuditRepository } from '../../../ports/index.js';
import { DB, type Database } from '../database.js';
import { auditRecords } from '../schema/index.js';

@Injectable()
export class DrizzleAuditRepository implements AuditRepository {
  constructor(@Inject(DB) private readonly db: Database) {}
  async append(record: AuditRecord): Promise<void> {
    const s = record.toSnapshot();
    try {
      await this.db.insert(auditRecords).values({ ...s, at: new Date(s.at) });
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async listByIncident(incidentId: IncidentId): Promise<AuditRecord[]> {
    try {
      const rows = await this.db
        .select()
        .from(auditRecords)
        .where(eq(auditRecords.incidentId, incidentId))
        .orderBy(asc(auditRecords.at), asc(auditRecords.id));
      return rows.map((r) =>
        AuditRecord.rehydrate({
          ...r,
          id: asAuditId(r.id),
          incidentId: asIncidentId(r.incidentId),
          actorId: r.actorId === null ? null : asUserId(r.actorId),
          at: r.at.toISOString(),
        }),
      );
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
}
