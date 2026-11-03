import { describe, expect, it } from 'vitest';
import { Instant, Priority, Rating } from '../shared/index.js';
import { Incident } from '../incidents/incident.js';
import {
  at,
  assignee,
  category,
  sla,
  duplicateId,
  otherTechnician,
  reporter,
  reporterId,
  reportProps,
  system,
  technician,
  technicianId,
} from '../incidents/test-fixtures.js';
import {
  IncidentCreated,
  IncidentClassified,
  PriorityChanged,
  IncidentAssigned,
  IncidentAcknowledged,
  WorkStarted,
  NoteAdded,
  InfoRequested,
  InfoProvided,
  IncidentResolved,
  IncidentVerified,
  IncidentReopened,
  IncidentClosed,
  FeedbackGiven,
} from './incident-events.js';
import { IncidentEscalated } from './incident-escalated.js';
import { EscalationLevel } from '../escalation/index.js';
import { Role } from '../users/index.js';
import type { EventContext } from './domain-event.js';

function happyPath(): Incident {
  const time = (step: number): Instant => Instant.of(at.ms + step * 1000);
  const incident = Incident.report(reportProps);
  incident.classify(category, Priority.P2, sla, system, time(1));
  incident.assign(technician, 0, system, time(2));
  incident.acknowledge(assignee, time(3));
  incident.startWork(assignee, time(4));
  incident.requestInfo('Which office?', assignee, time(5));
  incident.provideInfo('Office A', reporter, time(6));
  incident.resolve('Restarted router', 'Hardware fault', assignee, time(7));
  incident.verify(reporter, time(8));
  incident.close(reporter, time(9));
  return incident;
}

describe('Incident lifecycle events', () => {
  it('happyPathEmitsExactlyTheOrderedLifecycleFacts', () => {
    const events = happyPath().pullEvents();
    expect(events.map((e) => [e.type, e.fromStatus, e.toStatus])).toEqual([
      ['IncidentCreated', null, 'NEW'],
      ['IncidentClassified', 'NEW', 'CLASSIFIED'],
      ['PriorityChanged', 'CLASSIFIED', 'CLASSIFIED'],
      ['IncidentAssigned', 'CLASSIFIED', 'ASSIGNED'],
      ['IncidentAcknowledged', 'ASSIGNED', 'ACKNOWLEDGED'],
      ['WorkStarted', 'ACKNOWLEDGED', 'IN_PROGRESS'],
      ['InfoRequested', 'IN_PROGRESS', 'PENDING_INFO'],
      ['InfoProvided', 'PENDING_INFO', 'IN_PROGRESS'],
      ['IncidentResolved', 'IN_PROGRESS', 'RESOLVED'],
      ['IncidentVerified', 'RESOLVED', 'VERIFIED'],
      ['IncidentClosed', 'VERIFIED', 'CLOSED'],
    ]);
    expect(events.map((e) => e.actorId)).toEqual([
      reporterId,
      null,
      null,
      null,
      technicianId,
      technicianId,
      technicianId,
      reporterId,
      technicianId,
      reporterId,
      reporterId,
    ]);
    expect(events.map((e) => e.occurredAt.ms)).toEqual(
      [0, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((step) => at.ms + step * 1000),
    );
    for (const event of events) {
      expect(event.incidentId).toBe(reportProps.id);
      expect(Object.isFrozen(event)).toBe(true);
    }
    expect(events[0]).toMatchObject({
      number: reportProps.number,
      reporterId,
      serviceId: reportProps.serviceId,
    });
    expect(events[1]).toMatchObject({ categoryId: category.id() });
    expect(events[2]).toMatchObject({ from: null, to: Priority.P2 });
    expect(events[3]).toMatchObject({ technicianId, previousTechnicianId: null });
    expect(events[6]).toMatchObject({ question: 'Which office?' });
    expect(events[7]).toMatchObject({ answer: 'Office A' });
    expect(events[8]).toMatchObject({ summary: 'Restarted router' });
    expect(events[10]).toMatchObject({ reason: 'RESOLVED', duplicateOfId: null });
  });
  it('pullEventsClearsAndReturnsFIFOWithoutRetainingReturnedArray', () => {
    const incident = Incident.report(reportProps);
    incident.classify(category, Priority.P2, sla, system, at);
    const first = incident.pullEvents();
    expect(first.map((event) => event.type)).toEqual([
      'IncidentCreated',
      'IncidentClassified',
      'PriorityChanged',
    ]);
    expect(incident.pullEvents()).toEqual([]);
    first.pop();
    incident.assign(otherTechnician, 0, system, at);
    expect(incident.pullEvents().map((event) => event.type)).toEqual(['IncidentAssigned']);
  });
  it('rehydrateRecordsNoEvents', () => {
    const incident = happyPath();
    const restored = Incident.rehydrate(incident.toSnapshot());
    expect(restored.pullEvents()).toEqual([]);
    expect(incident.pullEvents()).toHaveLength(11);
  });
});

const context: EventContext = {
  incidentId: reportProps.id,
  actorId: technicianId,
  occurredAt: at,
  fromStatus: 'IN_PROGRESS',
  toStatus: 'IN_PROGRESS',
};
const descriptions = [
  [
    new IncidentCreated(context, reportProps.number, reporterId, reportProps.serviceId),
    'Incident INC0007 reported by employee-E for service wifi.',
  ],
  [new IncidentClassified(context, category.id()), 'Incident incident-7 classified as network.'],
  [
    new PriorityChanged(context, null, Priority.P2),
    'Incident incident-7 priority changed from unassigned to P2.',
  ],
  [
    new PriorityChanged(context, Priority.P2, Priority.P1),
    'Incident incident-7 priority changed from P2 to P1.',
  ],
  [
    new IncidentAssigned(context, technicianId, null),
    'Incident incident-7 assigned to technician-T.',
  ],
  [new IncidentAcknowledged(context), 'Incident incident-7 acknowledged.'],
  [new WorkStarted(context), 'Work started on incident incident-7.'],
  [new NoteAdded(context, 'Investigating'), 'Note added to incident incident-7: Investigating'],
  [
    new InfoRequested(context, 'Which office?'),
    'Information requested for incident incident-7: Which office?',
  ],
  [new InfoProvided(context, 'Office A'), 'Information provided for incident incident-7: Office A'],
  [new IncidentResolved(context, 'Router fixed'), 'Incident incident-7 resolved: Router fixed'],
  [new IncidentVerified(context), 'Resolution verified for incident incident-7.'],
  [
    new IncidentReopened(context, 'Still broken', 2),
    'Incident incident-7 reopened (count 2): Still broken',
  ],
  [new IncidentClosed(context, 'RESOLVED', null), 'Incident incident-7 closed: RESOLVED.'],
  [
    new IncidentClosed(context, 'DUPLICATE', duplicateId),
    'Incident incident-7 closed: DUPLICATE of existing-incident.',
  ],
  [
    new FeedbackGiven(context, Rating.of(5)),
    'Feedback recorded for incident incident-7: 5 out of 5.',
  ],
] as const;

it.each(descriptions)('eventDescribesItsAuditFact %s', (event, description) => {
  expect(event.describe()).toBe(description);
});

it('freezesEveryPublishedIncidentEvent', () => {
  for (const [event] of descriptions) expect(Object.isFrozen(event)).toBe(true);
});

it('freezesEscalationEvents', () => {
  const event = new IncidentEscalated(
    context,
    EscalationLevel.TECHNICIAN,
    EscalationLevel.TEAM_LEAD,
    Role.TEAM_LEAD,
    'Escalated',
  );
  expect(Object.isFrozen(event)).toBe(true);
});
