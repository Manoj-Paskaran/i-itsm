/* eslint-disable @typescript-eslint/require-await -- Async ports backed by synchronous in-memory snapshots. */
import { Incident, type IncidentSnapshot } from '../../domain/incidents/index.js';
import {
  asIncidentId,
  IncidentNumber,
  type IncidentId,
  type UserId,
} from '../../domain/shared/index.js';
import type { IncidentRepository, IncidentSearchFilter } from '../../ports/index.js';
export class InMemoryIncidentRepository implements IncidentRepository {
  private readonly data = new Map<IncidentId, IncidentSnapshot>();
  private sequence = 0;
  async nextIdentity() {
    const n = ++this.sequence;
    return {
      id: asIncidentId(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`),
      number: IncidentNumber.of(`INC${String(n).padStart(4, '0')}`),
    };
  }
  async save(i: Incident) {
    this.data.set(i.id, structuredClone(i.toSnapshot()));
  }
  async findById(id: IncidentId) {
    const s = this.data.get(id);
    return s ? Incident.rehydrate(structuredClone(s)) : null;
  }
  async search(f: IncidentSearchFilter) {
    return [...this.data.values()]
      .filter(
        (s) =>
          (!f.from || Date.parse(s.createdAt) >= f.from.getTime()) &&
          (!f.to || Date.parse(s.createdAt) <= f.to.getTime()) &&
          (!f.categoryId || s.categoryId === f.categoryId) &&
          (!f.sla ||
            (s.slaClock !== null &&
              s.closure?.reason !== 'DUPLICATE' &&
              (f.sla === 'BREACHED'
                ? s.slaClock.breached.length > 0
                : s.slaClock.breached.length === 0))) &&
          (!f.reporterId || s.reporterId === f.reporterId) &&
          (!f.assigneeId || s.assigneeId === f.assigneeId) &&
          (!f.status || s.status === f.status) &&
          (!f.priority || s.priority === f.priority) &&
          (!f.serviceId || s.serviceId === f.serviceId) &&
          (!f.q ||
            [s.title, s.description, s.number].some((t) =>
              t.toLowerCase().includes(f.q!.toLowerCase()),
            )),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, f.limit)
      .map((s) => Incident.rehydrate(structuredClone(s)));
  }
  async findOpenByReporter(id: UserId) {
    return [...this.data.values()]
      .filter((s) => s.reporterId === id && s.status !== 'CLOSED')
      .map((s) => ({ id: s.id, number: s.number, serviceId: s.serviceId, title: s.title }));
  }
  async countOpenByAssignee() {
    const counts = new Map<UserId, number>();
    for (const s of this.data.values())
      if (s.assigneeId && s.status !== 'CLOSED')
        counts.set(s.assigneeId, (counts.get(s.assigneeId) ?? 0) + 1);
    return counts;
  }
  async listAssignedUnacknowledged() {
    return [...this.data.values()]
      .filter((s) => s.status === 'ASSIGNED')
      .map((s) => Incident.rehydrate(structuredClone(s)));
  }
  async listOpenClassified() {
    return [...this.data.values()]
      .filter((s) => s.status !== 'CLOSED' && s.priority !== null)
      .map((s) => Incident.rehydrate(structuredClone(s)));
  }
  async listUnresolved() {
    return [...this.data.values()]
      .filter((s) => !['RESOLVED', 'VERIFIED', 'CLOSED'].includes(s.status))
      .map((s) => Incident.rehydrate(structuredClone(s)));
  }
  async listResolved(limit: number) {
    return [...this.data.values()]
      .filter((s) => s.resolution && s.closure?.reason !== 'DUPLICATE')
      .filter((s) => ['RESOLVED', 'VERIFIED', 'CLOSED'].includes(s.status))
      .sort((a, b) => b.resolution!.at.localeCompare(a.resolution!.at))
      .slice(0, limit)
      .map((s) => Incident.rehydrate(structuredClone(s)));
  }
}
