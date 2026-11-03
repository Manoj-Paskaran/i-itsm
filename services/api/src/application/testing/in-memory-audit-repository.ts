/* eslint-disable @typescript-eslint/require-await -- Async ports backed by synchronous in-memory snapshots. */
import { AuditRecord, type AuditRecordSnapshot } from '../../domain/audit/index.js';
import type { IncidentId } from '../../domain/shared/index.js';
import type { AuditRepository } from '../../ports/index.js';
export class InMemoryAuditRepository implements AuditRepository {
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
