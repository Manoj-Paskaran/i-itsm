/* eslint-disable @typescript-eslint/require-await -- Async ports backed by synchronous in-memory snapshots. */
import { AuditRecord, type AuditRecordSnapshot } from '../../domain/audit/index.js';
import type { IncidentId } from '../../domain/shared/index.js';
import type { AuditSearchFilter, IncidentRepository, AuditRepository } from '../../ports/index.js';
export class InMemoryAuditRepository implements AuditRepository {
  constructor(private readonly incidents?: IncidentRepository) {}
  async search(filter: AuditSearchFilter) {
    const rows = this.data
      .filter(
        (s) =>
          (!filter.incidentId || s.incidentId === filter.incidentId) &&
          (!filter.actorId || s.actorId === filter.actorId) &&
          (!filter.action || s.action === filter.action) &&
          (!filter.from || new Date(s.at) >= filter.from) &&
          (!filter.to || new Date(s.at) <= filter.to),
      )
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
      .slice(0, filter.limit);
    return Promise.all(
      rows.map(async (s) => {
        const incident = await this.incidents?.findById(s.incidentId);
        if (!incident) throw new Error(`Incident ${s.incidentId} missing from audit search`);
        return {
          record: AuditRecord.rehydrate(structuredClone(s)),
          incidentNumber: incident.number.value,
        };
      }),
    );
  }
  private readonly data: AuditRecordSnapshot[] = [];
  async append(record: AuditRecord) {
    this.data.push(structuredClone(record.toSnapshot()));
  }
  async listByIncident(id: IncidentId) {
    return this.data
      .filter((s) => s.incidentId === id)
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((s) => AuditRecord.rehydrate(structuredClone(s)));
  }
}
