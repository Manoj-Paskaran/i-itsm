import { describe, expect, it } from 'vitest';
import {
  IncidentAssigned,
  IncidentEscalated,
  IncidentResolved,
  InfoRequested,
  NoteAdded,
  PriorityChanged,
  SlaBreached,
  SPEC_NOTIFICATION_TRIGGERS,
} from '../../domain/events/index.js';
import { EscalationLevel } from '../../domain/escalation/index.js';
import { Incident } from '../../domain/incidents/index.js';
import {
  at,
  employee,
  reporterId,
  snapshot,
  technician,
  technicianId,
} from '../../domain/incidents/test-fixtures.js';
import { asUserId, Priority } from '../../domain/shared/index.js';
import { SlaKind } from '../../domain/sla/index.js';
import { Admin, Role, TeamLead } from '../../domain/users/index.js';
import type { ChannelKind, NotificationChannel } from '../../ports/index.js';
import { InMemoryIncidentRepository } from '../testing/in-memory-incident-repository.js';
import { InMemoryUserRepository } from '../testing/in-memory-user-repository.js';
import { NotificationDispatcher } from './notification-dispatcher.js';
import { NotificationFactory } from './notification-factory.js';
import type { NotificationMessage } from './notification-message.js';
import { NotificationRoutingPolicy } from './notification-routing-policy.js';

class RecordingChannel implements NotificationChannel {
  readonly messages: NotificationMessage[] = [];
  constructor(
    readonly kind: ChannelKind,
    readonly fail = false,
  ) {}
  async send(message: NotificationMessage): Promise<void> {
    await Promise.resolve();
    if (this.fail) throw new Error('delivery failed');
    this.messages.push(message);
  }
}
async function setup(failEmail = false) {
  const incidents = new InMemoryIncidentRepository();
  const users = new InMemoryUserRepository();
  const incident = Incident.rehydrate({ ...snapshot('ASSIGNED'), number: 'INC0215' });
  const lead = TeamLead.rehydrate({
    ...(technician.toSnapshot() as Extract<
      ReturnType<typeof technician.toSnapshot>,
      { role: typeof Role.TECHNICIAN }
    >),
    id: asUserId('lead'),
    role: Role.TEAM_LEAD,
    team: [technicianId],
  });
  const admin = Admin.rehydrate({
    id: asUserId('admin'),
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: 'hash',
    active: true,
  });
  await incidents.save(incident);
  for (const user of [employee, technician, lead, admin]) await users.save(user);
  const inApp = new RecordingChannel('IN_APP');
  const email = new RecordingChannel('EMAIL', failEmail);
  const dispatcher = new NotificationDispatcher(incidents, users, [inApp, email]);
  const context = {
    incidentId: incident.id,
    actorId: null,
    occurredAt: at,
    fromStatus: null,
    toStatus: null,
  };
  return { incident, users, lead, admin, inApp, email, dispatcher, context };
}
describe('notification rules', () => {
  it('assignmentNotifiesTechnicianInAppAndByEmail', async () => {
    const s = await setup();
    await s.dispatcher.on(new IncidentAssigned(s.context, technicianId, null));
    expect(s.inApp.messages.map((m) => m.recipientId)).toContain(technicianId);
    expect(s.email.messages.map((m) => m.recipientId)).toContain(technicianId);
  });
  it('assignmentNotifiesReporterInAppOnly', async () => {
    const s = await setup();
    await s.dispatcher.on(new IncidentAssigned(s.context, technicianId, null));
    expect(s.inApp.messages.map((m) => m.recipientId)).toContain(reporterId);
    expect(s.email.messages.map((m) => m.recipientId)).not.toContain(reporterId);
  });
  it('initialPriorityOnClassificationSendsNothing', async () => {
    const { dispatcher, inApp, email, context } = await setup();
    await dispatcher.on(new PriorityChanged(context, null, Priority.P1));
    expect(inApp.messages).toHaveLength(0);
    expect(email.messages).toHaveLength(0);
  });
  it('actorIsNotNotifiedOfOwnAction', async () => {
    const s = await setup();
    await s.dispatcher.on(
      new IncidentAssigned({ ...s.context, actorId: technicianId }, technicianId, null),
    );
    expect(s.inApp.messages.map((m) => m.recipientId)).not.toContain(technicianId);
    expect(s.email.messages).toHaveLength(0);
  });
  it('slaBreachNotifiesAssigneeTeamLeadAndAdmins', async () => {
    const s = await setup();
    await s.dispatcher.on(new SlaBreached(s.context, SlaKind.RESPONSE, at));
    for (const channel of [s.inApp, s.email])
      expect(channel.messages.map((m) => m.recipientId)).toEqual(
        expect.arrayContaining([technicianId, s.lead.id(), s.admin.id()]),
      );
  });
  it('escalationNotifiesUsersWithEscalatedRole', async () => {
    const s = await setup();
    await s.dispatcher.on(
      new IncidentEscalated(
        s.context,
        EscalationLevel.TECHNICIAN,
        EscalationLevel.TEAM_LEAD,
        Role.TEAM_LEAD,
        'Help needed',
      ),
    );
    expect(s.email.messages.map((m) => m.recipientId)).toEqual([s.lead.id()]);
  });
  it('resolvedNotifiesReporterByEmail', async () => {
    const s = await setup();
    await s.dispatcher.on(new IncidentResolved(s.context, 'Fixed'));
    expect(s.email.messages.map((m) => m.recipientId)).toEqual([reporterId]);
  });
  it('failingEmailChannelStillDeliversInApp', async () => {
    const s = await setup(true);
    await expect(
      s.dispatcher.on(new IncidentAssigned(s.context, technicianId, null)),
    ).rejects.toBeInstanceOf(AggregateError);
    expect(s.inApp.messages.map((m) => m.recipientId)).toEqual(
      expect.arrayContaining([technicianId, reporterId]),
    );
  });
  it('internalNoteDoesNotSendNotifications', async () => {
    const s = await setup();
    const event = new NoteAdded(s.context, 'Note');
    expect(s.dispatcher.handles(event.type)).toBe(false);
    await s.dispatcher.on(event);
    expect(s.inApp.messages).toHaveLength(0);
    expect(s.email.messages).toHaveLength(0);
  });
  it('everySpecTriggerHasARoute', () => {
    const policy = new NotificationRoutingPolicy();
    for (const type of Object.values(SPEC_NOTIFICATION_TRIGGERS))
      expect(policy.routesFor(type).length).toBeGreaterThan(0);
  });
  it('inactiveRecipientsAreSkipped', async () => {
    const s = await setup();
    const inactive = await s.users.findById(technicianId);
    inactive!.deactivate();
    await s.users.save(inactive!);
    await s.dispatcher.on(new IncidentAssigned(s.context, technicianId, null));
    expect(s.inApp.messages.map((message) => message.recipientId)).not.toContain(technicianId);
    expect(s.email.messages).toHaveLength(0);
  });
  it('overlappingAudiencesSendOnlyOncePerChannel', async () => {
    const s = await setup();
    const policy = new NotificationRoutingPolicy(
      new Map([
        [
          'IncidentAssigned',
          [{ audiences: ['ASSIGNEE', 'PREVIOUS_ASSIGNEE'], channels: ['IN_APP', 'EMAIL'] }],
        ],
      ]),
    );
    const dispatcher = new NotificationDispatcher(
      new InMemoryIncidentRepository(),
      s.users,
      [s.inApp, s.email],
      policy,
    );
    await dispatcher.on(new IncidentAssigned(s.context, technicianId, technicianId));
    expect(s.inApp.messages).toHaveLength(1);
    expect(s.email.messages).toHaveLength(1);
  });
  it('factoryWritesReadableTitles', async () => {
    const s = await setup();
    const factory = new NotificationFactory();
    const incident = { id: s.incident.id, number: 'INC0215', title: 'Checkout returns 500' };
    expect(
      factory.create(new IncidentAssigned(s.context, technicianId, null), [technician], incident)[0]
        ?.title,
    ).toBe('INC0215 assigned to you');
    expect(
      factory.create(
        new IncidentEscalated(
          s.context,
          EscalationLevel.TECHNICIAN,
          EscalationLevel.TEAM_LEAD,
          Role.TEAM_LEAD,
          'Help needed',
        ),
        [s.lead],
        incident,
      )[0]?.title,
    ).toBe('INC0215 escalated to Team Lead');
    expect(
      factory.create(new SlaBreached(s.context, SlaKind.RESPONSE, at), [technician], incident)[0]
        ?.title,
    ).toBe('SLA breached on INC0215 (response)');
  });
  it('factoryPopulatesEmailTemplateFieldsWithoutChangingInAppFields', async () => {
    const s = await setup();
    const factory = new NotificationFactory();
    const incident = {
      id: s.incident.id,
      number: 'INC0215',
      title: 'Payment Gateway declines every card at checkout',
      resolution: {
        summary: 'Restarted the gateway connector.',
        rootCause: 'TLS certificate pool exhausted.',
      },
    };
    const [resolved] = factory.create(
      new IncidentResolved(s.context, 'Restarted the gateway connector.'),
      [employee],
      incident,
      'Farah Nair',
    );
    expect(resolved?.title).toBe('INC0215 resolved');
    expect(resolved?.body).toBe('Restarted the gateway connector.');
    expect(resolved?.incidentTitle).toBe('Payment Gateway declines every card at checkout');
    expect(resolved?.resolutionSummary).toBe('Restarted the gateway connector.');
    expect(resolved?.rootCause).toBe('TLS certificate pool exhausted.');
    expect(resolved?.actorName).toBe('Farah Nair');

    const [infoRequested] = factory.create(
      new InfoRequested(s.context, 'Which card types are affected?'),
      [employee],
      incident,
      'Farah Nair',
    );
    expect(infoRequested?.title).toBe('Information requested for INC0215');
    expect(infoRequested?.body).toBe('Which card types are affected?');
    expect(infoRequested?.question).toBe('Which card types are affected?');
    expect(infoRequested?.actorName).toBe('Farah Nair');
  });
  it('dispatcherForwardsResolutionRootCauseAndActorNameToMessages', async () => {
    const s = await setup();
    const resolvedIncident = Incident.rehydrate({ ...snapshot('RESOLVED'), number: 'INC0215' });
    const incidents = new InMemoryIncidentRepository();
    await incidents.save(resolvedIncident);
    const inApp = new RecordingChannel('IN_APP');
    const email = new RecordingChannel('EMAIL');
    const dispatcher = new NotificationDispatcher(incidents, s.users, [inApp, email]);
    const context = { ...s.context, incidentId: resolvedIncident.id, actorId: technicianId };

    await dispatcher.on(new IncidentResolved(context, 'Restarted the router'));
    expect(email.messages[0]).toMatchObject({
      incidentNumber: 'INC0215',
      incidentTitle: 'WiFi is unavailable',
      resolutionSummary: 'Restarted the router',
      rootCause: 'Router fault',
      actorName: technician.name(),
    });

    await dispatcher.on(new InfoRequested(context, 'Which office?'));
    expect(email.messages[1]).toMatchObject({
      incidentNumber: 'INC0215',
      incidentTitle: 'WiFi is unavailable',
      question: 'Which office?',
      actorName: technician.name(),
    });
  });
});
