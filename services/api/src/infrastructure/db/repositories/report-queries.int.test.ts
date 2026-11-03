import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { InMemoryReportQueries } from '../../../application/testing/in-memory-report-queries.js';
import { Actor } from '../../../domain/incidents/index.js';
import { Duration, Priority } from '../../../domain/shared/index.js';
import { at, seed, sla } from '../testing/fixtures.js';
import { startTestPostgres, type TestPostgres } from '../testing/postgres-container.js';
import { DrizzleReportQueries } from './report-queries.js';
let postgres: TestPostgres;
beforeAll(async () => {
  postgres = await startTestPostgres();
});
afterAll(async () => {
  await postgres?.stop();
});
beforeEach(async () => {
  await postgres.clear();
});
it('matchesInMemoryReportsAcrossOpenMetBreachedAndDuplicate', async () => {
  const f = await seed(postgres);
  const open = await f.report();
  open.classify(f.category, Priority.P1, sla, Actor.system(), at);
  const met = await f.report();
  f.classify(met);
  f.assign(met);
  met.acknowledge(f.techActor, at);
  met.startWork(f.techActor, at);
  met.resolve('Fixed', undefined, f.techActor, at);
  met.verify(f.reporterActor, at);
  met.close(f.reporterActor, at);
  const late = await f.report();
  f.classify(late);
  f.assign(late);
  const later = at.plus(Duration.ofHours(3));
  late.checkSla(later);
  late.acknowledge(f.techActor, later);
  late.startWork(f.techActor, later);
  late.resolve('Fixed', undefined, f.techActor, later);
  late.verify(f.reporterActor, later);
  late.close(f.reporterActor, later);
  const duplicate = await f.report();
  f.classify(duplicate);
  // Breaches first, then is closed as a duplicate: must not count as an SLA violation anywhere.
  duplicate.checkSla(later);
  duplicate.closeAsDuplicate(open.id, Actor.system(), later);
  const all = [open, met, late, duplicate];
  for (const i of all) await f.incidents.save(i);
  const memory = new InMemoryReportQueries(
    all.map((i) => i.toSnapshot()),
    [f.technician],
    [f.service],
  );
  const db = new DrizzleReportQueries(postgres.db, f.incidents);
  expect(await db.overview(later)).toEqual(await memory.overview(later));
  expect(await db.sla(later)).toEqual(await memory.sla(later));
  expect(await db.services()).toEqual(await memory.services());
  expect(await db.trends(5, later)).toEqual(await memory.trends(5, later));
  expect((await db.overview(later)).slaViolations).toBe((await db.sla(later)).breached);
});
