/* eslint-disable @typescript-eslint/require-await -- Async ports backed by synchronous in-memory snapshots. */
import { Category, type CategorySnapshot } from '../../domain/catalog/index.js';
import type { CategoryId } from '../../domain/shared/index.js';
import type { CategoryRepository } from '../../ports/index.js';
export class InMemoryCategoryRepository implements CategoryRepository {
  private readonly data = new Map<CategoryId, CategorySnapshot>();
  async save(value: Category) {
    this.data.set(value.id(), structuredClone(value.toSnapshot()));
  }
  async findById(id: CategoryId) {
    const s = this.data.get(id);
    return s ? Category.rehydrate(structuredClone(s)) : null;
  }
  async listAll() {
    return [...this.data.values()].map((s) => Category.rehydrate(structuredClone(s)));
  }
  async listActive() {
    return [...this.data.values()]
      .filter((s) => s.active)
      .map((s) => Category.rehydrate(structuredClone(s)));
  }
}
