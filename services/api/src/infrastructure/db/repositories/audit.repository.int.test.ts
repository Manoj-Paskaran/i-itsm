import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { AuditRecord } from '../../../domain/audit/index.js';
import { asAuditId, Instant } from '../../../domain/shared/index.js';
import { at, seed } from '../testing/fixtures.js';
import { startTestPostgres, type TestPostgres } from '../testing/postgres-container.js';
import { DrizzleAuditRepository } from './audit.repository.js';

let postgres: TestPostgres;
let f: Awaited<ReturnType<typeof seed>>;
let audit: DrizzleAuditRepository;
beforeAll(async () => {
  postgres = await startTestPostgres();
  audit = new DrizzleAuditRepository(postgres.db);
});
afterAll(async () => {
  await postgres?.stop();
});
beforeEach(async () => {
  await postgres.clear();
  f = await seed(postgres);
});
async function records() {
  const incident = await f.report();
  await f.incidents.save(incident);
  const other = await f.report();
  await f.incidents.save(other);
  const create = (incidentId: typeof incident.id, time: string, description: string) =>
    AuditRecord.create({
      id: asAuditId(randomUUID()),
      at: Instant.fromIso(time),
      actorId: f.reporter.id(),
      action: 'CREATED',
      incidentId,
      fromStatus: null,
      toStatus: 'NEW',
      description,
    });
  return { incident, other, create };
}
it('appendsAndListsAuditRecordsInOrder', async () => {
  const { incident, other, create } = await records();
  const first = create(incident.id, '2026-11-03T09:00:00.000Z', 'First action');
  const second = create(incident.id, '2026-11-03T09:01:00.000Z', 'Second action');
  const third = create(other.id, '2026-11-03T09:02:00.000Z', 'Other incident');
  await audit.append(second);
  await audit.append(third);
  await audit.append(first);
  expect((await audit.listByIncident(incident.id)).map((record) => record.toSnapshot())).toEqual([
    first.toSnapshot(),
    second.toSnapshot(),
  ]);
  expect((await audit.listByIncident(other.id)).map((record) => record.toSnapshot())).toEqual([
    third.toSnapshot(),
  ]);
});
it('auditRecordsAreInsertOnly', async () => {
  const { incident, create } = await records();
  const record = create(incident.id, at.toIso(), 'Immutable audit entry');
  await audit.append(record);
  await expect(
    postgres.pool.query('UPDATE audit_records SET description = $1 WHERE id = $2', [
      'Changed',
      record.toSnapshot().id,
    ]),
  ).rejects.toThrow('audit_records is insert-only');
  expect((await audit.listByIncident(incident.id))[0]?.toSnapshot()).toEqual(record.toSnapshot());
});
