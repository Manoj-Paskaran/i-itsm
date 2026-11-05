import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { ConcurrentModificationException } from '../../../domain/exceptions/index.js';
import { Actor, type Incident } from '../../../domain/incidents/index.js';
import { asUserId } from '../../../domain/shared/index.js';
import { Role, UserFactory } from '../../../domain/users/index.js';
import { at, seed } from '../testing/fixtures.js';
import { startTestPostgres, type TestPostgres } from '../testing/postgres-container.js';

let postgres: TestPostgres;
let f: Awaited<ReturnType<typeof seed>>;
beforeAll(async () => {
  postgres = await startTestPostgres();
});
afterAll(async () => {
  await postgres?.stop();
});
beforeEach(async () => {
  await postgres.clear();
  f = await seed(postgres);
});

it('roundTripsIncidentThroughEveryLifecycleStep', async () => {
  let incident = await f.report();
  async function saveAndReload() {
    const expected = incident.toSnapshot();
    await f.incidents.save(incident);
    const loaded = await f.incidents.findById(incident.id);
    expect(loaded?.toSnapshot()).toEqual(expected);
    if (!loaded) throw new Error('Incident was not found');
    incident = loaded;
  }
  await saveAndReload();
  f.classify(incident);
  await saveAndReload();
  f.assign(incident);
  await saveAndReload();
  incident.acknowledge(f.techActor, at);
  await saveAndReload();
  incident.startWork(f.techActor, at);
  await saveAndReload();
  incident.addNote('Investigated the router', f.techActor, at);
  await saveAndReload();
  incident.requestInfo('Which office is affected?', f.techActor, at);
  await saveAndReload();
  incident.provideInfo('Office A is affected', f.reporterActor, at);
  await saveAndReload();
  incident.resolve('Restarted the router', 'Router fault', f.techActor, at);
  await saveAndReload();
  incident.verify(f.reporterActor, at);
  await saveAndReload();
  incident.close(f.reporterActor, at);
  await saveAndReload();
});
it('preservesNoteOrderWhenNotesHaveTheSameInstant', async () => {
  const incident = await f.report();
  f.classify(incident);
  f.assign(incident);
  incident.acknowledge(f.techActor, at);
  incident.startWork(f.techActor, at);
  incident.addNote('First investigation note', f.techActor, at);
  incident.addNote('Second investigation note', f.techActor, at);
  await f.incidents.save(incident);
  expect((await f.incidents.findById(incident.id))?.toSnapshot().notes).toEqual(
    incident.toSnapshot().notes,
  );
});
it('rejectsStaleIncidentSave', async () => {
  const incident = await f.report();
  await f.incidents.save(incident);
  const first = (await f.incidents.findById(incident.id))!;
  const stale = (await f.incidents.findById(incident.id))!;
  f.classify(first);
  f.classify(stale);
  await f.incidents.save(first);
  await expect(f.incidents.save(stale)).rejects.toBeInstanceOf(ConcurrentModificationException);
  expect((await f.incidents.findById(incident.id))?.toSnapshot()).toEqual(first.toSnapshot());
});
it('allocatesSequentialIncidentNumbers', async () => {
  const first = await f.incidents.nextIdentity();
  const second = await f.incidents.nextIdentity();
  expect(Number(second.number.value.slice(3))).toBe(Number(first.number.value.slice(3)) + 1);
  expect(first.id).not.toBe(second.id);
  expect(first.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});
it('findsOpenIncidentsByReporter', async () => {
  const open = await f.report();
  await f.incidents.save(open);
  const closed = await f.report();
  f.classify(closed);
  closed.closeAsDuplicate(open.id, Actor.system(), at);
  await f.incidents.save(closed);
  const another = UserFactory.create({
    id: asUserId(randomUUID()),
    name: 'Another',
    email: 'another@example.com',
    passwordHash: 'hash',
    role: Role.EMPLOYEE,
    department: 'IT',
  });
  await f.userRepo.save(another);
  const other = await f.report();
  const otherSnapshot = { ...other.toSnapshot(), reporterId: another.id() };
  const { Incident } = await import('../../../domain/incidents/index.js');
  await f.incidents.save(Incident.rehydrate(otherSnapshot));
  expect(await f.incidents.findOpenByReporter(f.reporter.id())).toEqual([
    {
      id: open.id,
      number: open.toSnapshot().number,
      serviceId: f.service.id(),
      title: open.toSnapshot().title,
    },
  ]);
});
it('countsOpenIncidentsPerAssignee', async () => {
  const open = await f.report();
  f.classify(open);
  f.assign(open);
  await f.incidents.save(open);
  const second = await f.report();
  f.classify(second);
  f.assign(second);
  second.acknowledge(f.techActor, at);
  await f.incidents.save(second);
  const closed = await f.report();
  f.classify(closed);
  f.assign(closed);
  closed.closeAsDuplicate(open.id, Actor.system(), at);
  await f.incidents.save(closed);
  const unassigned = await f.report();
  await f.incidents.save(unassigned);
  expect(await f.incidents.countOpenByAssignee()).toEqual(new Map([[f.technician.id(), 2]]));
});
it('listsAssignedUnacknowledgedForEscalation', async () => {
  const assigned = await f.report();
  f.classify(assigned);
  f.assign(assigned);
  await f.incidents.save(assigned);
  const acknowledged = await f.report();
  f.classify(acknowledged);
  f.assign(acknowledged);
  acknowledged.acknowledge(f.techActor, at);
  await f.incidents.save(acknowledged);
  const fresh = await f.report();
  await f.incidents.save(fresh);
  const actual = await f.incidents.listAssignedUnacknowledged();
  expect(actual.map((i: Incident) => i.toSnapshot())).toEqual([assigned.toSnapshot()]);
  expect((await f.incidents.listOpenClassified()).map((i) => i.id).sort()).toEqual(
    [assigned.id, acknowledged.id].sort(),
  );
});
it('listsUnresolvedAndResolvedNonDuplicateIncidentsForInsights', async () => {
  const working = await f.report();
  f.classify(working);
  f.assign(working);
  await f.incidents.save(working);
  const resolved = await f.report();
  f.classify(resolved);
  f.assign(resolved);
  resolved.acknowledge(f.techActor, at);
  resolved.startWork(f.techActor, at);
  resolved.resolve('Restarted the router', 'Router fault', f.techActor, at);
  await f.incidents.save(resolved);
  const duplicate = await f.report();
  f.classify(duplicate);
  duplicate.closeAsDuplicate(working.id, Actor.system(), at);
  await f.incidents.save(duplicate);
  expect((await f.incidents.listUnresolved()).map((i) => i.id)).toEqual([working.id]);
  expect((await f.incidents.listResolved(10)).map((i) => i.id)).toEqual([resolved.id]);
  expect(await f.incidents.listResolved(0)).toEqual([]);
});
