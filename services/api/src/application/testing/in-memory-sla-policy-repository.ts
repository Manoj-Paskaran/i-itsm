/* eslint-disable @typescript-eslint/require-await -- Async ports backed by synchronous in-memory snapshots. */
import { SlaPolicy, type SlaPolicySnapshot } from '../../domain/sla/index.js';
import type { SlaPolicyId } from '../../domain/shared/index.js';
import type { SlaPolicyRepository } from '../../ports/index.js';
export class InMemorySlaPolicyRepository implements SlaPolicyRepository {
  private readonly data = new Map<SlaPolicyId, SlaPolicySnapshot>();
  async save(value: SlaPolicy) {
    this.data.set(value.id(), structuredClone(value.toSnapshot()));
  }
  async findById(id: SlaPolicyId) {
    const s = this.data.get(id);
    return s ? SlaPolicy.rehydrate(structuredClone(s)) : null;
  }
  async listAll() {
    return [...this.data.values()].map((s) => SlaPolicy.rehydrate(structuredClone(s)));
  }
}
