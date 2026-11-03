import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Category, ItService } from '../../../domain/catalog/index.js';
import { DatabaseFailureException } from '../../../domain/exceptions/index.js';
import {
  asCategoryId,
  asItServiceId,
  type CategoryId,
  type ItServiceId,
} from '../../../domain/shared/index.js';
import type { CategoryRepository, ItServiceRepository } from '../../../ports/index.js';
import { DB, type Database } from '../database.js';
import { categories, itServices } from '../schema/index.js';

@Injectable()
export class DrizzleItServiceRepository implements ItServiceRepository {
  constructor(@Inject(DB) private readonly db: Database) {}
  private map(row: typeof itServices.$inferSelect): ItService {
    return ItService.rehydrate({
      ...row,
      id: asItServiceId(row.id),
      ...(row.description === '' ? { description: undefined } : {}),
    });
  }
  async findById(id: ItServiceId): Promise<ItService | null> {
    try {
      const [row] = await this.db.select().from(itServices).where(eq(itServices.id, id));
      return row ? this.map(row) : null;
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async listActive(): Promise<ItService[]> {
    try {
      return (await this.db.select().from(itServices).where(eq(itServices.active, true))).map(
        (row) => this.map(row),
      );
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async save(service: ItService): Promise<void> {
    const s = service.toSnapshot();
    const values = { ...s, description: s.description ?? '' };
    try {
      await this.db
        .insert(itServices)
        .values(values)
        .onConflictDoUpdate({ target: itServices.id, set: values });
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
}
@Injectable()
export class DrizzleCategoryRepository implements CategoryRepository {
  constructor(@Inject(DB) private readonly db: Database) {}
  private map(row: typeof categories.$inferSelect): Category {
    return Category.rehydrate({ ...row, id: asCategoryId(row.id) });
  }
  async findById(id: CategoryId): Promise<Category | null> {
    try {
      const [row] = await this.db.select().from(categories).where(eq(categories.id, id));
      return row ? this.map(row) : null;
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async listActive(): Promise<Category[]> {
    try {
      return (await this.db.select().from(categories).where(eq(categories.active, true))).map(
        (row) => this.map(row),
      );
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async save(category: Category): Promise<void> {
    const values = category.toSnapshot();
    try {
      await this.db
        .insert(categories)
        .values(values)
        .onConflictDoUpdate({ target: categories.id, set: values });
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
}
