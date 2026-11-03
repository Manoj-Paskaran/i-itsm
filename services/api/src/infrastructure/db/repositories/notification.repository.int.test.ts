import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { EventType } from '../../../domain/events/index.js';
import { at, seed } from '../testing/fixtures.js';
import { startTestPostgres, type TestPostgres } from '../testing/postgres-container.js';
import { DrizzleNotificationRepository } from './notification.repository.js';
let postgres: TestPostgres;
let f: Awaited<ReturnType<typeof seed>>;
let repo: DrizzleNotificationRepository;
beforeAll(async () => {
  postgres = await startTestPostgres();
  repo = new DrizzleNotificationRepository(postgres.db);
});
afterAll(async () => {
  await postgres?.stop();
});
beforeEach(async () => {
  await postgres.clear();
  f = await seed(postgres);
});
async function add() {
  const incident = await f.report();
  await f.incidents.save(incident);
  return repo.add({
    recipientId: f.technician.id(),
    recipientName: 'Technician',
    recipientEmail: 'tech@example.com',
    eventType: EventType.IncidentAssigned,
    title: 'Assigned',
    body: 'Details',
    incidentId: incident.id,
    incidentNumber: incident.toSnapshot().number,
    createdAt: at,
  });
}
it('storesListsAndMarksNotificationsRead', async () => {
  const { id } = await add();
  expect(await repo.unreadCount(f.technician.id())).toBe(1);
  expect((await repo.listFor(f.technician.id(), 50))[0]).toMatchObject({
    id,
    title: 'Assigned',
    readAt: null,
  });
  expect(await repo.markRead(f.technician.id(), id)).toBe(true);
  expect(await repo.unreadCount(f.technician.id())).toBe(0);
  await add();
  await repo.markAllRead(f.technician.id());
  expect(await repo.unreadCount(f.technician.id())).toBe(0);
});
it('cannotMarkSomeoneElsesNotification', async () => {
  const { id } = await add();
  expect(await repo.markRead(f.reporter.id(), id)).toBe(false);
  expect(await repo.unreadCount(f.technician.id())).toBe(1);
});
