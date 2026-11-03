import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { AuditRecord } from '../../../domain/audit/index.js';
import { DatabaseFailureException } from '../../../domain/exceptions/index.js';
import {
  asAuditId,
  asIncidentId,
  asUserId,
  type IncidentId,
} from '../../../domain/shared/index.js';
import type { AuditRepository, AuditSearchFilter } from '../../../ports/index.js';
import { DB, type Database } from '../database.js';
import { auditRecords, incidents } from '../schema/index.js';

@Injectable()
export class DrizzleAuditRepository implements AuditRepository {
  constructor(@Inject(DB) private readonly db: Database) {}
  async search(filter: AuditSearchFilter) {
    try {
      const rows = await this.db
        .select({ record: auditRecords, number: incidents.number })
        .from(auditRecords)
        .innerJoin(incidents, eq(auditRecords.incidentId, incidents.id))
        .where(
          and(
            filter.incidentId ? eq(auditRecords.incidentId, filter.incidentId) : undefined,
            filter.actorId ? eq(auditRecords.actorId, filter.actorId) : undefined,
            filter.action ? eq(auditRecords.action, filter.action) : undefined,
            filter.from ? gte(auditRecords.at, filter.from) : undefined,
            filter.to ? lte(auditRecords.at, filter.to) : undefined,
          ),
        )
        .orderBy(desc(auditRecords.at), desc(auditRecords.id))
        .limit(filter.limit);
      return rows.map(({ record: r, number }) => ({
        record: AuditRecord.rehydrate({
          ...r,
          id: asAuditId(r.id),
          incidentId: asIncidentId(r.incidentId),
          actorId: r.actorId === null ? null : asUserId(r.actorId),
          at: r.at.toISOString(),
        }),
        incidentNumber: number,
      }));
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
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
