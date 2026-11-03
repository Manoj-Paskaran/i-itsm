import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNotNull, ne, or, sql } from 'drizzle-orm';
import {
  ConcurrentModificationException,
  DatabaseFailureException,
} from '../../../domain/exceptions/index.js';
import { Incident } from '../../../domain/incidents/index.js';
import {
  asIncidentId,
  asItServiceId,
  asUserId,
  IncidentNumber,
  type IncidentId,
  type UserId,
} from '../../../domain/shared/index.js';
import type { IncidentRepository, IncidentSearchFilter } from '../../../ports/index.js';
import { DB, nextIncidentNumber, type Database } from '../database.js';
import { incidentSnapshot, incidentValues } from '../mappers/incident.mapper.js';
import { incidents, infoRequests, investigationNotes } from '../schema/index.js';

@Injectable()
export class DrizzleIncidentRepository implements IncidentRepository {
  private readonly versions = new WeakMap<Incident, number>();
  constructor(@Inject(DB) private readonly db: Database) {}
  private async map(row: typeof incidents.$inferSelect): Promise<Incident> {
    const [notes, requests] = await Promise.all([
      this.db
        .select()
        .from(investigationNotes)
        .where(eq(investigationNotes.incidentId, row.id))
        .orderBy(asc(investigationNotes.at), asc(investigationNotes.id)),
      this.db
        .select()
        .from(infoRequests)
        .where(eq(infoRequests.incidentId, row.id))
        .orderBy(asc(infoRequests.askedAt), asc(infoRequests.id)),
    ]);
    const incident = Incident.rehydrate(incidentSnapshot(row, notes, requests));
    this.versions.set(incident, row.version);
    return incident;
  }
  async search(filter: IncidentSearchFilter): Promise<Incident[]> {
    try {
      const conditions = [
        filter.reporterId ? eq(incidents.reporterId, filter.reporterId) : undefined,
        filter.assigneeId ? eq(incidents.assigneeId, filter.assigneeId) : undefined,
        filter.status ? sql`${incidents.status} = ${filter.status}` : undefined,
        filter.priority ? sql`${incidents.priority} = ${filter.priority}` : undefined,
        filter.serviceId ? eq(incidents.serviceId, filter.serviceId) : undefined,
        filter.q
          ? or(
              ...[incidents.title, incidents.description, incidents.number].map((col) =>
                ilike(col, `%${filter.q!.replace(/[\\%_]/g, '\\$&')}%`),
              ),
            )
          : undefined,
      ];
      const rows = await this.db
        .select()
        .from(incidents)
        .where(and(...conditions))
        .orderBy(desc(incidents.createdAt), desc(incidents.id))
        .limit(filter.limit);
      return await Promise.all(rows.map((row) => this.map(row)));
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async nextIdentity(): Promise<{ id: IncidentId; number: IncidentNumber }> {
    try {
      const result = await this.db.execute<{ id: string }>(sql`select uuidv7() as id`);
      return {
        id: asIncidentId(result.rows[0]!.id),
        number: IncidentNumber.of(await nextIncidentNumber(this.db)),
      };
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async findById(id: IncidentId): Promise<Incident | null> {
    try {
      const [row] = await this.db.select().from(incidents).where(eq(incidents.id, id));
      return row ? await this.map(row) : null;
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async findOpenByReporter(
    reporterId: UserId,
  ): Promise<
    Array<{ id: IncidentId; serviceId: ReturnType<typeof asItServiceId>; title: string }>
  > {
    try {
      const rows = await this.db
        .select({ id: incidents.id, serviceId: incidents.serviceId, title: incidents.title })
        .from(incidents)
        .where(and(eq(incidents.reporterId, reporterId), ne(incidents.status, 'CLOSED')));
      return rows.map((r) => ({
        ...r,
        id: asIncidentId(r.id),
        serviceId: asItServiceId(r.serviceId),
      }));
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async countOpenByAssignee(): Promise<Map<UserId, number>> {
    try {
      const rows = await this.db
        .select({ id: incidents.assigneeId, count: sql<number>`count(*)::int` })
        .from(incidents)
        .where(and(isNotNull(incidents.assigneeId), ne(incidents.status, 'CLOSED')))
        .groupBy(incidents.assigneeId);
      return new Map(rows.map((r) => [asUserId(r.id!), r.count]));
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async listAssignedUnacknowledged(): Promise<Incident[]> {
    try {
      return await Promise.all(
        (await this.db.select().from(incidents).where(eq(incidents.status, 'ASSIGNED'))).map((r) =>
          this.map(r),
        ),
      );
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async listOpenClassified(): Promise<Incident[]> {
    try {
      return await Promise.all(
        (
          await this.db
            .select()
            .from(incidents)
            .where(and(ne(incidents.status, 'CLOSED'), isNotNull(incidents.priority)))
        ).map((r) => this.map(r)),
      );
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async save(incident: Incident): Promise<void> {
    const s = incident.toSnapshot();
    const values = incidentValues(s);
    const version = this.versions.get(incident);
    try {
      await this.db.transaction(async (tx) => {
        if (version === undefined) await tx.insert(incidents).values({ ...values, version: 1 });
        else {
          const updated = await tx
            .update(incidents)
            .set({ ...values, version: sql`${incidents.version} + 1` })
            .where(and(eq(incidents.id, s.id), eq(incidents.version, version)))
            .returning({ id: incidents.id });
          if (!updated.length) throw new ConcurrentModificationException(s.id);
        }
        await tx.delete(investigationNotes).where(eq(investigationNotes.incidentId, s.id));
        await tx.delete(infoRequests).where(eq(infoRequests.incidentId, s.id));
        if (s.notes.length)
          await tx.insert(investigationNotes).values(
            s.notes.map((n) => ({
              incidentId: s.id,
              authorId: n.authorId,
              text: n.text,
              at: new Date(n.at),
            })),
          );
        if (s.infoRequests.length)
          await tx.insert(infoRequests).values(
            s.infoRequests.map((q) => ({
              incidentId: s.id,
              question: q.question,
              askedBy: q.askedBy,
              askedAt: new Date(q.askedAt),
              answer: q.answer ?? null,
              answeredAt: q.answeredAt ? new Date(q.answeredAt) : null,
            })),
          );
      });
      this.versions.set(incident, version === undefined ? 1 : version + 1);
    } catch (error) {
      if (error instanceof ConcurrentModificationException) throw error;
      throw new DatabaseFailureException(error);
    }
  }
}
