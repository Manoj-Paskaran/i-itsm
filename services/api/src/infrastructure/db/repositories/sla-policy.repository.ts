import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseFailureException } from '../../../domain/exceptions/index.js';
import { asItServiceId, asSlaPolicyId, type SlaPolicyId } from '../../../domain/shared/index.js';
import { SlaPolicy } from '../../../domain/sla/index.js';
import type { SlaPolicyRepository } from '../../../ports/index.js';
import { DB, type Database } from '../database.js';
import { slaPolicies, slaTargets } from '../schema/index.js';

@Injectable()
export class DrizzleSlaPolicyRepository implements SlaPolicyRepository {
  constructor(@Inject(DB) private readonly db: Database) {}
  private async map(row: typeof slaPolicies.$inferSelect): Promise<SlaPolicy> {
    const targets = await this.db.select().from(slaTargets).where(eq(slaTargets.policyId, row.id));
    return SlaPolicy.rehydrate({
      id: asSlaPolicyId(row.id),
      name: row.name,
      serviceId: row.serviceId === null ? null : asItServiceId(row.serviceId),
      warningRatio: Number(row.warningRatio),
      targets: targets.map((t) => [
        t.priority,
        { response: t.responseMs, resolution: t.resolutionMs },
      ]),
    });
  }
  async findById(id: SlaPolicyId): Promise<SlaPolicy | null> {
    try {
      const [row] = await this.db.select().from(slaPolicies).where(eq(slaPolicies.id, id));
      return row ? await this.map(row) : null;
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async listAll(): Promise<SlaPolicy[]> {
    try {
      return await Promise.all(
        (await this.db.select().from(slaPolicies)).map((row) => this.map(row)),
      );
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
  async save(policy: SlaPolicy): Promise<void> {
    const s = policy.toSnapshot();
    const values = {
      id: s.id,
      name: s.name,
      serviceId: s.serviceId,
      warningRatio: String(s.warningRatio),
    };
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .insert(slaPolicies)
          .values(values)
          .onConflictDoUpdate({ target: slaPolicies.id, set: values });
        await tx.delete(slaTargets).where(eq(slaTargets.policyId, s.id));
        if (s.targets.length)
          await tx.insert(slaTargets).values(
            s.targets.map(([priority, t]) => ({
              policyId: s.id,
              priority,
              responseMs: t.response,
              resolutionMs: t.resolution,
            })),
          );
      });
    } catch (error) {
      throw new DatabaseFailureException(error);
    }
  }
}
