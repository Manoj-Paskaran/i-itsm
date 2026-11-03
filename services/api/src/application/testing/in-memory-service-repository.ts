/* eslint-disable @typescript-eslint/require-await -- Async ports backed by synchronous in-memory snapshots. */
import { ItService, type ItServiceSnapshot } from '../../domain/catalog/index.js';
import type { ItServiceId } from '../../domain/shared/index.js';
import type { ItServiceRepository } from '../../ports/index.js';
export class InMemoryServiceRepository implements ItServiceRepository {
  private readonly data = new Map<ItServiceId, ItServiceSnapshot>();
  async save(value: ItService) {
    this.data.set(value.id(), structuredClone(value.toSnapshot()));
  }
  async findById(id: ItServiceId) {
    const s = this.data.get(id);
    return s ? ItService.rehydrate(structuredClone(s)) : null;
  }
  async listAll() {
    return [...this.data.values()].map((s) => ItService.rehydrate(structuredClone(s)));
  }
  async listActive() {
    return [...this.data.values()]
      .filter((s) => s.active)
      .map((s) => ItService.rehydrate(structuredClone(s)));
  }
}
