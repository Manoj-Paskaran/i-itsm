import { describe, expect, it } from 'vitest';
import { Incident } from '../../domain/incidents/incident.js';
import {
  assignee,
  at,
  category,
  reporter,
  reportProps,
  sla,
  system,
  technician,
} from '../../domain/incidents/test-fixtures.js';
import {
  ALL_EVENT_TYPES,
  EventType,
  NoteAdded,
  SPEC_NOTIFICATION_TRIGGERS,
} from '../../domain/events/index.js';
import { InvalidInputException } from '../../domain/exceptions/index.js';
import { asAuditId, Priority } from '../../domain/shared/index.js';
import { AuditRecord } from '../../domain/audit/index.js';
import type { DomainEvent } from '../../domain/events/index.js';
import type { EventSubscriber } from '../../ports/index.js';
import { AuditRecorder } from '../audit/audit-recorder.js';
import { InProcessEventPublisher } from './in-process-event-publisher.js';

function events(): DomainEvent[] {
  const incident = Incident.report(reportProps);
  incident.classify(category, Priority.P2, sla, system, at);
  incident.assign(technician, 0, system, at);
  incident.acknowledge(assignee, at);
  incident.startWork(assignee, at);
  incident.resolve('Fixed', undefined, assignee, at);
  incident.verify(reporter, at);
  incident.close(reporter, at);
  return incident.pullEvents();
}
function subscriber(
  name: string,
  on: (event: DomainEvent) => Promise<void>,
  handles: EventSubscriber['handles'] = () => true,
): EventSubscriber {
  return { name, handles, on };
}
describe('event publishing and audit', () => {
  it('publishDeliversEventsInOrderToMatchingSubscribers', async () => {
    const publisher = new InProcessEventPublisher();
    const calls: string[] = [];
    for (const name of ['a', 'b'])
      publisher.subscribe(
        subscriber(name, (event) => {
          calls.push(`${event.type}:${name}`);
          return Promise.resolve();
        }),
      );
    const input = events();
    expect(await publisher.publish(input)).toEqual({ delivered: input.length * 2, failures: [] });
    expect(calls).toEqual(input.flatMap((event) => [`${event.type}:a`, `${event.type}:b`]));
  });
  it('publishSkipsSubscribersThatDoNotHandleType', async () => {
    const publisher = new InProcessEventPublisher();
    const calls: string[] = [];
    publisher.subscribe(
      subscriber(
        'one',
        (event) => {
          calls.push(event.type);
          return Promise.resolve();
        },
        (type) => type === EventType.IncidentCreated,
      ),
    );
    expect((await publisher.publish(events())).delivered).toBe(1);
    expect(calls).toEqual([EventType.IncidentCreated]);
  });
  it('failingSubscriberDoesNotBlockOthers', async () => {
    const publisher = new InProcessEventPublisher();
    const calls: string[] = [];
    const error = new Error('broken');
    publisher.subscribe(subscriber('broken', () => Promise.reject(error)));
    publisher.subscribe(
      subscriber('good', async (event) => {
        calls.push(event.type);
        return Promise.resolve();
      }),
    );
    const input = events();
    const report = await publisher.publish(input);
    expect(calls).toEqual(input.map((event) => event.type));
    expect(report.delivered).toBe(input.length);
    expect(report.failures).toEqual(
      input.map((event) => ({ subscriber: 'broken', eventType: event.type, error })),
    );
  });
  it('rejectsDuplicateSubscriberName', () => {
    const publisher = new InProcessEventPublisher();
    publisher.subscribe(subscriber('same', async () => {}));
    expect(() => publisher.subscribe(subscriber('same', async () => {}))).toThrow(
      InvalidInputException,
    );
  });
  it('auditRecordFromEventCopiesStatusesAndDescription', () => {
    const changing = events()[1]!;
    const note = new NoteAdded(
      {
        incidentId: changing.incidentId,
        actorId: changing.actorId,
        occurredAt: at,
        fromStatus: null,
        toStatus: null,
      },
      'Investigated',
    );
    for (const event of [changing, note]) {
      expect(AuditRecord.fromEvent(event, asAuditId('audit')).toSnapshot()).toMatchObject({
        at: event.occurredAt.toIso(),
        actorId: event.actorId,
        action: event.type,
        incidentId: event.incidentId,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        description: event.describe(),
      });
    }
  });
  it('auditRecorderWritesOneRecordPerEvent', async () => {
    const records: AuditRecord[] = [];
    const publisher = new InProcessEventPublisher();
    publisher.subscribe(
      new AuditRecorder(
        {
          append: (record) => {
            records.push(record);
            return Promise.resolve();
          },
        },
        () => asAuditId(`audit-${records.length}`),
      ),
    );
    const input = events();
    expect(await publisher.publish(input)).toEqual({ delivered: input.length, failures: [] });
    const snapshots = records.map((record) => record.toSnapshot());
    expect(snapshots.map((record) => record.action)).toEqual([
      'IncidentCreated',
      'IncidentClassified',
      'PriorityChanged',
      'IncidentAssigned',
      'IncidentAcknowledged',
      'WorkStarted',
      'IncidentResolved',
      'IncidentVerified',
      'IncidentClosed',
    ]);
    const changes = snapshots.filter((record) => record.toStatus !== null);
    for (let i = 1; i < changes.length; i++)
      expect(changes[i - 1]!.toStatus).toBe(changes[i]!.fromStatus);
  });
  it('everySpecNotificationTriggerHasAnEventType', () => {
    expect(Object.keys(SPEC_NOTIFICATION_TRIGGERS)).toEqual([
      'Incident created',
      'Incident assigned',
      'Priority changed',
      'Technician assigned',
      'SLA approaching',
      'SLA violated',
      'Incident resolved',
      'Incident closed',
    ]);
    for (const type of Object.values(SPEC_NOTIFICATION_TRIGGERS))
      expect(ALL_EVENT_TYPES).toContain(type);
  });
  it('eventTypesAreUnique', () =>
    expect(new Set(ALL_EVENT_TYPES).size).toBe(ALL_EVENT_TYPES.length));
});
