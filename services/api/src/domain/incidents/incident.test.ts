import { describe, expect, it } from 'vitest';
import {
  InvalidIncidentException,
  InvalidInputException,
  InvalidStateTransitionException,
  TechnicianUnavailableException,
  UnauthorizedOperationException,
  WorkloadExceededException,
} from '../exceptions/index.js';
import { Instant, Priority, Rating, asUserId } from '../shared/index.js';
import { Availability, Role, Technician } from '../users/index.js';
import { Category } from '../catalog/index.js';
import { Actor } from './actor.js';
import { Incident } from './incident.js';
import type { IncidentStatus } from './state/index.js';
import {
  at,
  later,
  assignee,
  category,
  sla,
  duplicateId,
  inState,
  other,
  otherTechnician,
  reporter,
  reporterId,
  reportProps,
  snapshot,
  system,
  technician,
  technicianId,
} from './test-fixtures.js';

type Command = (incident: Incident) => void;
function rejectsUnchanged(
  incident: Incident,
  command: Command,
  error: new (...args: never[]) => Error,
): void {
  const before = incident.toSnapshot();
  expect(() => command(incident)).toThrow(error);
  expect(incident.toSnapshot()).toEqual(before);
  expect(incident.pullEvents()).toEqual([]);
}

describe('Incident business rules', () => {
  it('reportsNewIncidentWithValidatedValueObjects', () => {
    const incident = Incident.report(reportProps);
    expect(incident.id).toBe(reportProps.id);
    expect(incident.number).toBe(reportProps.number);
    expect(incident.reporterId()).toBe(reporterId);
    expect(incident.assigneeId()).toBeNull();
    expect(incident.priority()).toBeNull();
    expect(incident.status()).toBe('NEW');
    expect(incident.isOpen()).toBe(true);
    expect(incident.notes()).toEqual([]);
    expect(incident.openInfoRequest()).toBeUndefined();
    expect(incident.resolution()).toBeNull();
    expect(incident.toSnapshot().createdAt).toBe(at.toIso());
  });
  it('rejectsCloseFromNew', () => {
    rejectsUnchanged(inState('NEW'), (i) => i.close(reporter, at), InvalidStateTransitionException);
  });
  it('checksStateBeforeOwnershipAndPayloadRules', () => {
    rejectsUnchanged(
      inState('NEW'),
      (i) => i.resolve('', undefined, other, at),
      InvalidStateTransitionException,
    );
    rejectsUnchanged(
      inState('NEW'),
      (i) => i.closeAsDuplicate(i.id, system, at),
      InvalidStateTransitionException,
    );
  });
  it('rejectsInactiveCategory', () => {
    const inactive = Category.rehydrate({ ...category.toSnapshot(), active: false });
    rejectsUnchanged(
      inState('NEW'),
      (i) => i.classify(inactive, Priority.P1, sla, system, at),
      InvalidIncidentException,
    );
  });
  it('failedRuleRetainsPreviouslyPendingEvents', () => {
    const incident = Incident.report(reportProps);
    const inactive = Category.rehydrate({ ...category.toSnapshot(), active: false });
    expect(() => incident.classify(inactive, Priority.P1, sla, system, at)).toThrow(
      InvalidIncidentException,
    );
    expect(incident.status()).toBe('NEW');
    expect(incident.pullEvents().map((event) => event.type)).toEqual(['IncidentCreated']);
  });
  it('classifySetsCategoryAndPriorityTogether', () => {
    const incident = inState('NEW');
    incident.classify(category, Priority.P1, sla, system, later);
    expect(incident.toSnapshot()).toMatchObject({
      status: 'CLASSIFIED',
      categoryId: category.id(),
      priority: 'P1',
    });
    expect(incident.priority()).toBe(Priority.P1);
  });

  const ownershipRules: ReadonlyArray<readonly [string, IncidentStatus, Command]> = [
    ['rejectsAcknowledgeByNonAssignee', 'ASSIGNED', (i) => i.acknowledge(other, at)],
    ['rejectsStartWorkByNonAssignee', 'ACKNOWLEDGED', (i) => i.startWork(other, at)],
    ['rejectsAddNoteByNonAssignee', 'IN_PROGRESS', (i) => i.addNote('A note', other, at)],
    [
      'rejectsRequestInfoByNonAssignee',
      'IN_PROGRESS',
      (i) => i.requestInfo('A question', other, at),
    ],
    [
      'rejectsResolveByNonAssignee',
      'IN_PROGRESS',
      (i) => i.resolve('A summary', undefined, other, at),
    ],
    [
      'rejectsProvideInfoByNonReporter',
      'PENDING_INFO',
      (i) => i.provideInfo('An answer', other, at),
    ],
    ['rejectsVerifyByNonReporter', 'RESOLVED', (i) => i.verify(other, at)],
    ['rejectsRejectByNonReporter', 'RESOLVED', (i) => i.reject('Still broken', other, at)],
    [
      'rejectsFeedbackByNonReporter',
      'VERIFIED',
      (i) => i.giveFeedback(Rating.of(4), undefined, other, at),
    ],
  ];
  it.each(ownershipRules)('%s', (_name, status, command) => {
    rejectsUnchanged(inState(status), command, UnauthorizedOperationException);
  });
  it('rejectsSystemWorkWhenNoAssigneeExists', () => {
    const incident = Incident.rehydrate({ ...snapshot('ASSIGNED'), assigneeId: null });
    rejectsUnchanged(incident, (i) => i.acknowledge(system, at), UnauthorizedOperationException);
  });
  it('reportsIncidentWorkPermissionForNonAssignee', () => {
    expect(() => inState('ASSIGNED').acknowledge(other, at)).toThrow(
      expect.objectContaining({
        details: { actorRole: Role.EMPLOYEE, permission: 'INCIDENT_WORK' },
      }),
    );
  });
  it('rejectsSystemActingAsReporter', () => {
    rejectsUnchanged(
      inState('RESOLVED'),
      (i) => i.verify(system, at),
      UnauthorizedOperationException,
    );
  });
  it('letsTheReporterAddInformationToTheirOwnIncident', () => {
    const incident = inState('IN_PROGRESS');
    incident.addNote('It also fails on the guest network', reporter, at);
    expect(incident.notes().at(-1)?.authorId).toBe(reporterId);
    expect(incident.status()).toBe('IN_PROGRESS');
  });
  it('allowsTeamLeadToAddNote', () => {
    const incident = inState('IN_PROGRESS');
    incident.addNote('Helped investigate', Actor.of(asUserId('lead'), Role.TEAM_LEAD), at);
    expect(incident.notes().at(-1)?.text).toBe('Helped investigate');
    expect(incident.status()).toBe('IN_PROGRESS');
  });
  it.each([Role.ADMIN, Role.IT_MANAGER])('allows%sToAddNote', (role) => {
    const incident = inState('PENDING_INFO');
    incident.addNote('Management note', Actor.of(asUserId(role), role), at);
    expect(incident.notes().at(-1)?.authorId).toBe(role);
  });
  it.each([Role.TEAM_LEAD, Role.ADMIN, Role.IT_MANAGER])(
    'rejects%sWorkingForAnotherAssignee',
    (role) => {
      rejectsUnchanged(
        inState('IN_PROGRESS'),
        (i) => i.resolve('Fixed', undefined, Actor.of(asUserId(role), role), at),
        UnauthorizedOperationException,
      );
    },
  );
  it('rejectsSystemAddingNote', () => {
    rejectsUnchanged(
      inState('IN_PROGRESS'),
      (i) => i.addNote('A note', system, at),
      UnauthorizedOperationException,
    );
  });
  it('rejectsAssigningUnavailableTechnician', () => {
    const unavailable = Technician.rehydrate({
      ...otherTechnician.toSnapshot(),
      role: Role.TECHNICIAN,
      availability: Availability.ON_LEAVE,
    } as Parameters<typeof Technician.rehydrate>[0]);
    rejectsUnchanged(
      inState('CLASSIFIED'),
      (i) => i.assign(unavailable, 0, system, at),
      TechnicianUnavailableException,
    );
  });
  it('rejectsAssigningTechnicianAtCapacity', () => {
    rejectsUnchanged(
      inState('CLASSIFIED'),
      (i) => i.assign(technician, 2, system, at),
      WorkloadExceededException,
    );
  });
  it.each([-1, 0.5, NaN, Infinity])('rejectsInvalidActiveCount %s', (count) => {
    rejectsUnchanged(
      inState('CLASSIFIED'),
      (i) => i.assign(technician, count, system, at),
      InvalidInputException,
    );
  });
  it('rejectsReassigningToSameTechnician', () => {
    rejectsUnchanged(
      inState('ASSIGNED'),
      (i) => i.assign(technician, 0, system, at),
      InvalidIncidentException,
    );
  });
  it('allowsAssigningBelowCapacityAndRecordsPreviousAssignee', () => {
    const incident = inState('IN_PROGRESS');
    incident.assign(otherTechnician, 1, system, later);
    expect(incident.status()).toBe('ASSIGNED');
    expect(incident.assigneeId()).toBe(otherTechnician.id());
    expect(incident.pullEvents()[0]).toMatchObject({
      type: 'IncidentAssigned',
      technicianId: otherTechnician.id(),
      previousTechnicianId: technicianId,
      actorId: null,
      occurredAt: later,
    });
  });
  it('requiresNewAssigneeAfterReassignment', () => {
    const incident = inState('ASSIGNED');
    incident.assign(otherTechnician, 0, system, at);
    incident.pullEvents();
    rejectsUnchanged(incident, (i) => i.acknowledge(assignee, at), UnauthorizedOperationException);
    incident.acknowledge(Actor.user(otherTechnician), at);
    expect(incident.status()).toBe('ACKNOWLEDGED');
  });
  it('rejectsDuplicateOfSelf', () => {
    rejectsUnchanged(
      inState('CLASSIFIED'),
      (i) => i.closeAsDuplicate(i.id, system, at),
      InvalidIncidentException,
    );
  });
  it('duplicateClosureRecordsTargetAndActor', () => {
    const incident = inState('CLASSIFIED');
    incident.closeAsDuplicate(duplicateId, system, later);
    expect(incident.toSnapshot()).toMatchObject({
      duplicateOfId: duplicateId,
      closure: {
        reason: 'DUPLICATE',
        closedBy: null,
        duplicateOfId: duplicateId,
        at: later.toIso(),
      },
    });
    expect(incident.pullEvents()[0]).toMatchObject({
      reason: 'DUPLICATE',
      duplicateOfId: duplicateId,
      fromStatus: 'CLASSIFIED',
      toStatus: 'CLOSED',
    });
    expect(Incident.rehydrate(incident.toSnapshot()).toSnapshot()).toEqual(incident.toSnapshot());
  });
  it('resolvedClosureRecordsReasonAndActor', () => {
    const incident = inState('VERIFIED');
    incident.close(reporter, later);
    expect(incident.toSnapshot().closure).toEqual({
      reason: 'RESOLVED',
      closedBy: reporterId,
      at: later.toIso(),
    });
    expect(incident.isOpen()).toBe(false);
  });
  it('rejectsSecondFeedback', () => {
    const incident = inState('VERIFIED');
    incident.giveFeedback(Rating.of(4), 'Thanks', reporter, at);
    incident.pullEvents();
    rejectsUnchanged(
      incident,
      (i) => i.giveFeedback(Rating.of(3), undefined, reporter, at),
      InvalidIncidentException,
    );
    const restored = Incident.rehydrate(incident.toSnapshot());
    restored.close(reporter, later);
    restored.pullEvents();
    rejectsUnchanged(
      restored,
      (i) => i.giveFeedback(Rating.of(3), undefined, reporter, later),
      InvalidIncidentException,
    );
  });
  it('rejectsFeedbackBeforeVerification', () => {
    rejectsUnchanged(
      inState('RESOLVED'),
      (i) => i.giveFeedback(Rating.of(5), undefined, reporter, at),
      InvalidStateTransitionException,
    );
  });
  it.each([
    'NEW',
    'CLASSIFIED',
    'ASSIGNED',
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'PENDING_INFO',
    'REOPENED',
  ] as const)('rejectsFeedbackIn%s', (status) =>
    rejectsUnchanged(
      inState(status),
      (i) => i.giveFeedback(Rating.of(5), undefined, reporter, at),
      InvalidStateTransitionException,
    ),
  );
  it.each(['VERIFIED', 'CLOSED'] as const)('allowsFirstReporterFeedbackIn%s', (status) => {
    const incident = inState(status);
    incident.giveFeedback(Rating.of(5), undefined, reporter, later);
    expect(incident.toSnapshot().feedback).toEqual({ rating: 5, at: later.toIso() });
    expect(incident.status()).toBe(status);
    expect(incident.pullEvents()[0]).toMatchObject({
      type: 'FeedbackGiven',
      rating: Rating.of(5),
      fromStatus: status,
      toStatus: status,
    });
  });
  it('reprioritiseWithSamePriorityRecordsNoEvent', () => {
    const incident = inState('IN_PROGRESS');
    const before = incident.toSnapshot();
    incident.reprioritise(Priority.P2, sla, system, at);
    expect(incident.toSnapshot()).toEqual(before);
    expect(incident.pullEvents()).toEqual([]);
  });
  it.each(['NEW', 'CLOSED'] as const)('rejectsReprioritiseIn%s', (status) => {
    rejectsUnchanged(
      inState(status),
      (i) => i.reprioritise(Priority.P1, sla, system, at),
      InvalidStateTransitionException,
    );
  });
  it.each([
    'CLASSIFIED',
    'ASSIGNED',
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'PENDING_INFO',
    'RESOLVED',
    'VERIFIED',
    'REOPENED',
  ] as const)('allowsReprioritiseWhileOpenIn%s', (status) => {
    const incident = inState(status);
    incident.reprioritise(Priority.P1, sla, system, later);
    expect(incident.priority()).toBe(Priority.P1);
    expect(incident.status()).toBe(status);
    expect(incident.pullEvents()).toMatchObject([
      {
        type: 'PriorityChanged',
        from: Priority.P2,
        to: Priority.P1,
        fromStatus: status,
        toStatus: status,
      },
    ]);
  });
  it('rejectReopensAndCountsReopens', () => {
    const incident = inState('RESOLVED');
    for (let count = 1; count <= 2; count += 1) {
      incident.reject('Still broken', reporter, later);
      expect(incident.status()).toBe('REOPENED');
      expect(incident.toSnapshot().reopenCount).toBe(count);
      expect(incident.pullEvents()).toMatchObject([
        { type: 'IncidentReopened', reason: 'Still broken', reopenCount: count },
      ]);
      incident.startWork(assignee, later);
      incident.resolve('Router fixed again', 'Hardware', assignee, later);
      incident.pullEvents();
    }
    const restored = Incident.rehydrate(incident.toSnapshot());
    restored.reject('Still broken', reporter, later);
    expect(restored.toSnapshot().reopenCount).toBe(3);
  });
  it('requestInfoAndProvideInfoPreserveConversation', () => {
    const incident = inState('IN_PROGRESS');
    incident.requestInfo('Which office?', assignee, at);
    expect(incident.openInfoRequest()?.toSnapshot()).toEqual({
      question: 'Which office?',
      askedBy: technicianId,
      askedAt: at.toIso(),
    });
    incident.provideInfo('Office A', reporter, later);
    expect(incident.openInfoRequest()).toBeUndefined();
    incident.requestInfo('Which floor?', assignee, later);
    expect(incident.toSnapshot().infoRequests).toHaveLength(2);
    expect(incident.toSnapshot().infoRequests[0]).toMatchObject({
      answer: 'Office A',
      answeredAt: later.toIso(),
    });
  });
  it('rejectsProvideInfoWithoutAnOpenRequest', () => {
    const incident = Incident.rehydrate({ ...snapshot('PENDING_INFO'), infoRequests: [] });
    rejectsUnchanged(
      incident,
      (i) => i.provideInfo('Office A', reporter, at),
      InvalidIncidentException,
    );
  });
  it('resolvePreservesSummaryRootCauseAndActor', () => {
    const incident = inState('IN_PROGRESS');
    incident.resolve('Restarted router', 'Overheated router', assignee, later);
    expect(incident.resolution()).toMatchObject({
      summary: 'Restarted router',
      rootCause: 'Overheated router',
      resolvedBy: technicianId,
      at: later,
    });
  });
});

describe('Incident input bounds', () => {
  it.each(['', ' ', 'ab', 'x'.repeat(201)])('rejectsTitleOutsideBounds %j', (title) => {
    expect(() => Incident.report({ ...reportProps, title })).toThrow(InvalidIncidentException);
  });
  it.each(['', ' ', 'x'.repeat(9), 'x'.repeat(5001)])(
    'rejectsDescriptionOutsideBoundsLength%s',
    (description) => {
      expect(() => Incident.report({ ...reportProps, description })).toThrow(
        InvalidIncidentException,
      );
    },
  );
  it.each([0, -1, 1.1, 1_000_001, NaN, Infinity, -Infinity])(
    'rejectsAffectedUsersOutsideBounds %s',
    (affectedUsers) => {
      expect(() => Incident.report({ ...reportProps, affectedUsers })).toThrow(
        InvalidIncidentException,
      );
    },
  );
  it.each([
    [3, 10, 1],
    [200, 5000, 1_000_000],
  ])('acceptsReportBounds %s/%s/%s', (titleLength, descriptionLength, affectedUsers) => {
    expect(
      Incident.report({
        ...reportProps,
        title: 't'.repeat(titleLength),
        description: 'd'.repeat(descriptionLength),
        affectedUsers,
      }).toSnapshot(),
    ).toMatchObject({ affectedUsers });
  });
  it('trimsReportTextBeforeCheckingBounds', () => {
    const incident = Incident.report({
      ...reportProps,
      title: '  abc  ',
      description: '  1234567890  ',
    });
    expect(incident.toSnapshot()).toMatchObject({ title: 'abc', description: '1234567890' });
  });
  const invalidTextRules: ReadonlyArray<readonly [string, IncidentStatus, Command]> = [
    ['rejectsEmptyNote', 'ASSIGNED', (i) => i.addNote(' ', assignee, at)],
    ['rejectsOverlongNote', 'ASSIGNED', (i) => i.addNote('x'.repeat(5001), assignee, at)],
    ['rejectsEmptyQuestion', 'IN_PROGRESS', (i) => i.requestInfo(' ', assignee, at)],
    [
      'rejectsOverlongQuestion',
      'IN_PROGRESS',
      (i) => i.requestInfo('x'.repeat(5001), assignee, at),
    ],
    ['rejectsEmptyAnswer', 'PENDING_INFO', (i) => i.provideInfo(' ', reporter, at)],
    ['rejectsOverlongAnswer', 'PENDING_INFO', (i) => i.provideInfo('x'.repeat(5001), reporter, at)],
    ['rejectsEmptyResolution', 'IN_PROGRESS', (i) => i.resolve(' ', undefined, assignee, at)],
    [
      'rejectsOverlongResolution',
      'IN_PROGRESS',
      (i) => i.resolve('x'.repeat(5001), undefined, assignee, at),
    ],
    ['rejectsShortReopenReason', 'RESOLVED', (i) => i.reject('ab', reporter, at)],
    ['rejectsEmptyReopenReason', 'RESOLVED', (i) => i.reject(' ', reporter, at)],
    ['rejectsOverlongReopenReason', 'RESOLVED', (i) => i.reject('x'.repeat(1001), reporter, at)],
    [
      'rejectsOverlongFeedbackComment',
      'VERIFIED',
      (i) => i.giveFeedback(Rating.of(4), 'x'.repeat(2001), reporter, at),
    ],
  ];
  it.each(invalidTextRules)('%s', (_name, status, command) => {
    rejectsUnchanged(inState(status), command, InvalidIncidentException);
  });
  it.each([1, 5000])('acceptsNoteQuestionAnswerAndResolutionBounds %s', (length) => {
    const incident = inState('IN_PROGRESS');
    const text = 'x'.repeat(length);
    incident.addNote(text, assignee, at);
    incident.requestInfo(text, assignee, at);
    incident.provideInfo(text, reporter, later);
    incident.resolve(text, undefined, assignee, later);
    expect(incident.resolution()?.summary).toHaveLength(length);
  });
  it.each([3, 1000])('acceptsReopenReasonBounds %s', (length) => {
    const incident = inState('RESOLVED');
    incident.reject('x'.repeat(length), reporter, at);
    expect(incident.status()).toBe('REOPENED');
  });
  it.each(['', 'x'.repeat(2000)])('acceptsFeedbackCommentBoundsLength%s', (comment) => {
    const incident = inState('VERIFIED');
    incident.giveFeedback(Rating.of(4), comment, reporter, at);
    expect(incident.toSnapshot().feedback?.comment).toBe(comment);
  });
});

describe('Incident encapsulation', () => {
  it('notesReturnsADefensiveReadonlyCopy', () => {
    const incident = inState('IN_PROGRESS');
    const before = incident.toSnapshot();
    (incident.notes() as unknown[]).pop();
    expect(incident.toSnapshot()).toEqual(before);
    expect(Object.isFrozen(incident.notes()[0])).toBe(true);
  });
  it('openInfoRequestReturnsADetachedCopy', () => {
    const incident = inState('PENDING_INFO');
    incident.openInfoRequest()!.answer('External answer', later);
    expect(incident.openInfoRequest()?.isOpen()).toBe(true);
    incident.provideInfo('Actual answer', reporter, at);
    expect(incident.toSnapshot().infoRequests[0]?.answer).toBe('Actual answer');
  });
  it('snapshotCollectionsCannotMutateTheAggregate', () => {
    const incident = inState('RESOLVED');
    const before = incident.toSnapshot();
    const data = incident.toSnapshot();
    Reflect.set(data.notes[0]!, 'text', 'External edit');
    Reflect.set(data.infoRequests[0]!, 'answer', 'External edit');
    Reflect.set(data.resolution!, 'summary', 'External edit');
    expect(incident.toSnapshot()).toEqual(before);
  });
  it('rehydrateDoesNotRetainSnapshotReferences', () => {
    const data = snapshot('PENDING_INFO');
    const incident = Incident.rehydrate(data);
    const before = incident.toSnapshot();
    Reflect.set(data.infoRequests[0]!, 'question', 'External edit');
    Reflect.set(data.notes[0]!, 'text', 'External edit');
    expect(incident.toSnapshot()).toEqual(before);
  });
  it('snapshotRoundTripPreservesAllOptionalCompositionFields', () => {
    const incident = inState('IN_PROGRESS');
    incident.resolve('Fixed router', 'Hardware fault', assignee, at);
    incident.verify(reporter, at);
    incident.giveFeedback(Rating.of(5), 'Thanks', reporter, later);
    incident.close(system, later);
    const restored = Incident.rehydrate(incident.toSnapshot());
    expect(restored.toSnapshot()).toEqual(incident.toSnapshot());
    expect(restored.pullEvents()).toEqual([]);
    expect(Object.isFrozen(restored.resolution())).toBe(true);
  });
  it('snapshotRoundTripPreservesAbsentOptionalFields', () => {
    const incident = inState('IN_PROGRESS');
    incident.resolve('Fixed router', undefined, assignee, at);
    incident.verify(reporter, at);
    incident.giveFeedback(Rating.of(5), undefined, reporter, later);
    expect(Incident.rehydrate(incident.toSnapshot()).toSnapshot()).toEqual(incident.toSnapshot());
  });
  it('usesOnlyTheSuppliedCommandTime', () => {
    const supplied = Instant.of(0);
    const incident = inState('IN_PROGRESS');
    incident.addNote('Timed note', assignee, supplied);
    expect(incident.notes().at(-1)?.at).toBe(supplied);
    expect(incident.pullEvents()[0]?.occurredAt).toBe(supplied);
  });
});

it('namesInvalidIncidentFieldsAndRules', () => {
  const inactive = Category.rehydrate({ ...category.toSnapshot(), active: false });
  const cases: Array<[RegExp, () => unknown]> = [
    [/title/i, () => Incident.report({ ...reportProps, title: '' })],
    [/description/i, () => Incident.report({ ...reportProps, description: '' })],
    [/affectedUsers/i, () => Incident.report({ ...reportProps, affectedUsers: 0 })],
    [/category/i, () => inState('NEW').classify(inactive, Priority.P1, sla, system, at)],
    [/assigned/i, () => inState('ASSIGNED').assign(technician, 0, system, at)],
    [
      /information request/i,
      () =>
        Incident.rehydrate({ ...snapshot('PENDING_INFO'), infoRequests: [] }).provideInfo(
          'Answer',
          reporter,
          at,
        ),
    ],
    [/reason/i, () => inState('RESOLVED').reject('', reporter, at)],
    [
      /duplicate/i,
      () => {
        const i = inState('CLASSIFIED');
        i.closeAsDuplicate(i.id, system, at);
      },
    ],
    [
      /feedback/i,
      () => {
        const i = inState('VERIFIED');
        i.giveFeedback(Rating.of(4), undefined, reporter, at);
        i.giveFeedback(Rating.of(4), undefined, reporter, at);
      },
    ],
  ];
  for (const [message, invoke] of cases) {
    expect(invoke).toThrow(InvalidIncidentException);
    expect(invoke).toThrow(message);
  }
});

it.each([
  [
    'provideInfo',
    'PENDING_INFO',
    (i: Incident) => i.provideInfo('Answer', other, at),
    'INCIDENT_VERIFY_OWN',
  ],
  ['verify', 'RESOLVED', (i: Incident) => i.verify(other, at), 'INCIDENT_VERIFY_OWN'],
  [
    'reject',
    'RESOLVED',
    (i: Incident) => i.reject('Still broken', other, at),
    'INCIDENT_VERIFY_OWN',
  ],
  [
    'feedback',
    'VERIFIED',
    (i: Incident) => i.giveFeedback(Rating.of(4), undefined, other, at),
    'INCIDENT_FEEDBACK',
  ],
] as const)('reportsPermissionFor%s', (_action, status, invoke, permission) => {
  const run = () => invoke(inState(status));
  expect(run).toThrow(UnauthorizedOperationException);
  expect(run).toThrow(
    expect.objectContaining({ details: { actorRole: Role.EMPLOYEE, permission } }),
  );
});

it.each(['reprioritise', 'giveFeedback'] as const)('reportsIllegal%sAction', (action) => {
  const run = () =>
    action === 'reprioritise'
      ? inState('NEW').reprioritise(Priority.P1, sla, system, at)
      : inState('NEW').giveFeedback(Rating.of(4), undefined, reporter, at);
  expect(run).toThrow(InvalidStateTransitionException);
  expect(run).toThrow(expect.objectContaining({ details: { from: 'NEW', action } }));
});

it('preservesAbsentOptionalSnapshotFields', () => {
  const incident = inState('IN_PROGRESS');
  incident.resolve('Fixed', undefined, assignee, at);
  expect(incident.toSnapshot().resolution).not.toHaveProperty('rootCause');
  incident.verify(reporter, at);
  incident.giveFeedback(Rating.of(4), undefined, reporter, at);
  expect(incident.toSnapshot().feedback).not.toHaveProperty('comment');
  incident.close(reporter, at);
  expect(incident.toSnapshot().closure).not.toHaveProperty('duplicateOfId');
});

it('preservesEarlierAnswersWhenAnsweringLaterRequest', () => {
  const incident = inState('IN_PROGRESS');
  incident.requestInfo('First?', assignee, at);
  incident.provideInfo('First answer', reporter, at);
  incident.requestInfo('Second?', assignee, at);
  incident.provideInfo('Second answer', reporter, at);
  expect(incident.toSnapshot().infoRequests.map((request) => request.answer)).toEqual([
    'First answer',
    'Second answer',
  ]);
});

it('supportsLifecycleActionsWhenNoSlaClockExists', () => {
  const withoutClock = (status: IncidentStatus) =>
    Incident.rehydrate({ ...snapshot(status), slaClock: null });
  const unprioritised = Incident.rehydrate({
    ...snapshot('CLASSIFIED'),
    priority: null,
    slaClock: null,
  });
  unprioritised.reprioritise(Priority.P1, sla, system, at);
  expect(unprioritised.priority()).toBe(Priority.P1);
  const assigned = withoutClock('ASSIGNED');
  assigned.acknowledge(assignee, at);
  expect(assigned.status()).toBe('ACKNOWLEDGED');
  const progress = withoutClock('IN_PROGRESS');
  progress.requestInfo('Question?', assignee, at);
  progress.provideInfo('Answer', reporter, at);
  progress.resolve('Fixed', undefined, assignee, at);
  progress.reject('Still broken', reporter, at);
  expect(progress.status()).toBe('REOPENED');
});
