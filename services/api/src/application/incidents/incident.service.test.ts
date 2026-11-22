import { describe, expect, it, vi } from 'vitest';
import { AssignmentStrategyRegistry, TechnicianAssigner } from '../../domain/assignment/index.js';
import { Category, ItService } from '../../domain/catalog/index.js';
import {
  DuplicateIncidentException,
  IncidentNotFoundException,
  ServiceNotFoundException,
  UnauthorizedOperationException,
} from '../../domain/exceptions/index.js';
import {
  at,
  category,
  employee,
  otherTechnician,
  service,
  technician,
} from '../../domain/incidents/test-fixtures.js';
import { MatrixPriorityStrategy, PriorityStrategyRegistry } from '../../domain/priority/index.js';
import {
  asAuditId,
  asCategoryId,
  asIncidentId,
  asItServiceId,
  asSlaPolicyId,
  asUserId,
  FixedClock,
  Duration,
} from '../../domain/shared/index.js';
import { SlaPolicy } from '../../domain/sla/index.js';
import {
  Admin,
  Availability,
  Employee,
  ITManager,
  Role,
  TeamLead,
  Technician,
} from '../../domain/users/index.js';
import { AuditRecorder } from '../audit/audit-recorder.js';
import { InProcessEventPublisher } from '../events/in-process-event-publisher.js';
import { InMemoryAuditRepository } from '../testing/in-memory-audit-repository.js';
import { InMemoryCategoryRepository } from '../testing/in-memory-category-repository.js';
import { InMemoryIncidentRepository } from '../testing/in-memory-incident-repository.js';
import { InMemoryServiceRepository } from '../testing/in-memory-service-repository.js';
import { InMemorySlaPolicyRepository } from '../testing/in-memory-sla-policy-repository.js';
import { InMemoryUserRepository } from '../testing/in-memory-user-repository.js';
import { IncidentService } from './incident.service.js';
import { KeywordCategorySuggester } from './keyword-category-suggester.js';

const app = Category.create({
  id: asCategoryId('app'),
  code: 'APPLICATION',
  name: 'Application',
  requiredSkill: 'application',
  active: true,
});
const database = Category.create({
  id: asCategoryId('db'),
  code: 'DATABASE',
  name: 'Database',
  requiredSkill: 'database',
  active: true,
});
const admin = Admin.rehydrate({
  id: asUserId('admin'),
  name: 'Admin',
  email: 'admin@example.com',
  passwordHash: 'hash',
  active: true,
});
const employee2 = Employee.rehydrate({
  ...employee.toSnapshot(),
  id: asUserId('employee2'),
  email: 'e2@example.com',
});
const cmd = {
  title: 'WiFi network unavailable',
  description: 'The office network wifi is unavailable',
  serviceId: service.id(),
  impact: 4,
  urgency: 4,
  affectedUsers: 200,
};
async function setup(available = true, assignee = technician) {
  const incidents = new InMemoryIncidentRepository(),
    users = new InMemoryUserRepository(),
    services = new InMemoryServiceRepository(),
    categories = new InMemoryCategoryRepository(),
    policies = new InMemorySlaPolicyRepository(),
    audit = new InMemoryAuditRepository();
  const tech = Technician.rehydrate({
    ...assignee.toSnapshot(),
    availability: available ? Availability.AVAILABLE : Availability.OFF_SHIFT,
  } as Parameters<typeof Technician.rehydrate>[0]);
  for (const u of [employee, employee2, tech, admin]) await users.save(u);
  await services.save(service);
  for (const c of [category, app, database]) await categories.save(c);
  await policies.save(SlaPolicy.specDefault(asSlaPolicyId('default')));
  const clock = new FixedClock(at);
  const events = new InProcessEventPublisher();
  let n = 0;
  events.subscribe(new AuditRecorder(audit, () => asAuditId(`audit-${++n}`)));
  const matrix = new MatrixPriorityStrategy();
  const assigner = new TechnicianAssigner(AssignmentStrategyRegistry.withDefaults());
  const suggester = new KeywordCategorySuggester();
  const svc = new IncidentService(
    incidents,
    users,
    services,
    categories,
    policies,
    suggester,
    new PriorityStrategyRegistry([matrix], matrix.name),
    assigner,
    events,
    clock,
    audit,
  );
  return { svc, incidents, users, services, categories, suggester, audit, tech, clock, assigner };
}
const internalNote = 'Confirmed PG-503 across all cards; checking the gateway connection pool.';
async function setupInvestigation() {
  // The audit API validates actor ids as UUIDs.
  const assignee = Technician.rehydrate({
    ...technician.toSnapshot(),
    id: asUserId('22222222-2222-4222-8222-222222222222'),
  } as Parameters<typeof Technician.rehydrate>[0]);
  const { svc, users } = await setup(true, assignee);
  const reporter = Employee.rehydrate({
    ...employee.toSnapshot(),
    id: asUserId('11111111-1111-4111-8111-111111111111'),
  });
  await users.save(reporter);
  const { id } = await svc.report(reporter, cmd);
  await svc.acknowledge(assignee, id);
  await svc.startWork(assignee, id);
  await svc.addNote(assignee, id, internalNote);
  return { svc, assignee, reporter, id };
}
describe('IncidentService rules', () => {
  it('usesTheChatIntakeCategoryWhenGiven', async () => {
    const { svc, suggester } = await setup();
    const suggest = vi.spyOn(suggester, 'suggest');
    const result = await svc.report(employee, { ...cmd, categoryId: app.id() });
    expect(result.category?.code).toBe('APPLICATION');
    expect(suggest).not.toHaveBeenCalled();
  });
  it('ignoresAnInactiveChatIntakeCategory', async () => {
    const { svc, categories } = await setup();
    await categories.save(Category.create({ ...app.toSnapshot(), active: false }));
    const result = await svc.report(employee, { ...cmd, categoryId: app.id() });
    expect(result.category?.code).toBe('NETWORK');
  });
  it('ignoresAnUnknownChatIntakeCategory', async () => {
    const { svc } = await setup();
    const result = await svc.report(employee, { ...cmd, categoryId: 'missing' });
    expect(result.category?.code).toBe('NETWORK');
  });
  it('reportClassifiesPrioritisesAndAssignsInOneCall', async () => {
    const { svc, audit, services, users } = await setup();
    const payment = ItService.create({
      id: asItServiceId('payment'),
      name: 'Payment Gateway',
      criticality: 4,
      active: true,
    });
    await services.save(payment);
    const skilled = Technician.rehydrate({
      ...technician.toSnapshot(),
      skills: ['application'],
    } as Parameters<typeof Technician.rehydrate>[0]);
    await users.save(skilled);
    const d = await svc.report(employee, {
      ...cmd,
      serviceId: payment.id(),
      title: 'Payment checkout failure',
      description: 'Payment checkout app is failing for customers',
    });
    expect(d).toMatchObject({
      status: 'ASSIGNED',
      category: { code: 'APPLICATION' },
      priority: 'P1',
      assignee: { id: technician.id() },
      slaStatus: 'ON_TRACK',
    });
    expect(d.priorityRationale.length).toBeGreaterThan(0);
    expect(
      (await audit.listByIncident(asIncidentId(d.id))).map((r) => r.toSnapshot().action),
    ).toEqual(['IncidentCreated', 'IncidentClassified', 'PriorityChanged', 'IncidentAssigned']);
  });
  it('reportStaysClassifiedWhenNobodyAvailable', async () => {
    const { svc } = await setup(false);
    expect((await svc.report(employee, cmd)).status).toBe('CLASSIFIED');
  });
  it('reportRejectsUnknownService', async () => {
    const { svc } = await setup();
    await expect(svc.report(employee, { ...cmd, serviceId: 'missing' })).rejects.toBeInstanceOf(
      ServiceNotFoundException,
    );
  });
  it('reportRejectsDuplicateOpenIncident', async () => {
    const { svc } = await setup();
    await svc.report(employee, cmd);
    await expect(svc.report(employee, cmd)).rejects.toBeInstanceOf(DuplicateIncidentException);
  });
  it('employeeSeesOnlyOwnIncidents', async () => {
    const { svc } = await setup();
    await svc.report(employee, cmd);
    await svc.report(employee2, cmd);
    expect(await svc.list(employee, { limit: 50 })).toHaveLength(1);
  });
  it('technicianSeesOnlyAssigned', async () => {
    const { svc } = await setup();
    await svc.report(employee, cmd);
    expect(await svc.list(technician, { limit: 50 })).toHaveLength(1);
    expect(await svc.list(otherTechnician, { limit: 50 })).toHaveLength(0);
  });
  it('adminSeesAll', async () => {
    const { svc } = await setup();
    await svc.report(employee, cmd);
    await svc.report(employee2, cmd);
    expect(await svc.list(admin, { limit: 50 })).toHaveLength(2);
  });
  it('hiddenIncidentLooksNotFound', async () => {
    const { svc } = await setup();
    const d = await svc.report(employee, cmd);
    await expect(svc.get(employee2, d.id)).rejects.toBeInstanceOf(IncidentNotFoundException);
  });
  it('technicianCannotAssign', async () => {
    const { svc } = await setup();
    const d = await svc.report(employee, cmd);
    await expect(svc.assign(technician, d.id)).rejects.toBeInstanceOf(
      UnauthorizedOperationException,
    );
  });
  it('employeeCannotResolve', async () => {
    const { svc } = await setup();
    const d = await svc.report(employee, cmd);
    await expect(svc.resolve(employee, d.id, 'fixed')).rejects.toBeInstanceOf(
      UnauthorizedOperationException,
    );
  });
  it('fullLifecycleThroughService', async () => {
    const { svc } = await setup();
    const d = await svc.report(employee, cmd);
    await svc.acknowledge(technician, d.id);
    await svc.startWork(technician, d.id);
    await svc.addNote(technician, d.id, 'Investigating');
    await svc.requestInfo(technician, d.id, 'Where?');
    await svc.provideInfo(employee, d.id, 'Office');
    await svc.resolve(technician, d.id, 'Fixed router');
    await svc.verify(employee, d.id);
    await svc.feedback(employee, d.id, 5, 'Great');
    expect((await svc.close(employee, d.id)).status).toBe('CLOSED');
  });
  it('employeeDoesNotSeeInternalNotes', async () => {
    const { svc, reporter, id } = await setupInvestigation();
    expect((await svc.get(reporter, id)).notes).toEqual([]);
    const entries = await svc.audit(reporter, id);
    expect(entries.map((entry) => entry.action)).not.toContain('NoteAdded');
    expect(JSON.stringify(entries)).not.toContain(internalNote);
  });
  it('staffSeeInternalNotes', async () => {
    const { svc, assignee, id } = await setupInvestigation();
    const lead = TeamLead.rehydrate({
      ...(assignee.toSnapshot() as Parameters<typeof Technician.rehydrate>[0]),
      id: asUserId('lead'),
      role: Role.TEAM_LEAD,
      team: [],
    });
    const manager = ITManager.rehydrate({ ...admin.toSnapshot(), id: asUserId('manager') });
    for (const staff of [assignee, lead, manager, admin]) {
      expect((await svc.get(staff, id)).notes).toEqual([
        {
          author: { id: assignee.id(), name: assignee.name() },
          text: internalNote,
          at: at.toIso(),
        },
      ]);
      const note = (await svc.audit(staff, id)).find((entry) => entry.action === 'NoteAdded');
      expect(note?.description).toContain(internalNote);
    }
  });
  it('reporterStillSeesInfoRequestsAndResolution', async () => {
    const { svc, assignee, reporter, id } = await setupInvestigation();
    const question = 'When did the errors start?';
    const answer = 'At 09:15.';
    const summary = 'Restored checkout.';
    await svc.requestInfo(assignee, id, question);
    const answered = await svc.provideInfo(reporter, id, answer);
    expect(answered.notes).toEqual([]);
    expect(answered.infoRequests).toMatchObject([{ question, answer }]);
    await svc.resolve(assignee, id, summary);
    expect((await svc.get(reporter, id)).resolution?.summary).toBe(summary);
    const activity = new Map((await svc.audit(reporter, id)).map((e) => [e.action, e.description]));
    expect(activity.has('WorkStarted')).toBe(true);
    expect(activity.get('InfoRequested')).toContain(question);
    expect(activity.get('InfoProvided')).toContain(answer);
    expect(activity.get('IncidentResolved')).toContain(summary);
  });
  it('reporterStillSeesTheirOwnAddedInformation', async () => {
    const { svc, reporter, id } = await setupInvestigation();
    const own = 'Also failing on the mobile app.';
    const after = await svc.addNote(reporter, id, own);
    expect(after.notes.map((n) => n.text)).toEqual([own]);
    const notes = (await svc.audit(reporter, id)).filter((e) => e.action === 'NoteAdded');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.description).toContain(own);
  });
  it('commandRecordsSlaBreachEvenWithoutAMonitorSweep', async () => {
    const { svc, audit, clock } = await setup();
    const d = await svc.report(employee, cmd);
    clock.advance(Duration.ofHours(25));
    await svc.acknowledge(technician, d.id);
    const records = await audit.listByIncident(d.id as Parameters<typeof audit.listByIncident>[0]);
    const actions = records.map((r) => r.toSnapshot().action);
    expect(actions).toContain('SlaBreached');
    expect(actions.indexOf('SlaBreached')).toBeLessThan(actions.indexOf('IncidentAcknowledged'));
  });
  it('letsATeamLeadReadTheAuditOfAnIncidentTheyCanSee', async () => {
    const { svc, users } = await setup();
    // Audit entries expose actor ids as UUIDs, so this reporter needs a real one.
    const reporter = Employee.rehydrate({
      ...employee.toSnapshot(),
      id: asUserId('11111111-1111-4111-8111-111111111111'),
    });
    await users.save(reporter);
    const lead = TeamLead.rehydrate({
      ...(technician.toSnapshot() as Extract<
        ReturnType<typeof technician.toSnapshot>,
        { role: typeof Role.TECHNICIAN }
      >),
      id: asUserId('lead'),
      email: 'lead@example.com',
      role: Role.TEAM_LEAD,
      team: [],
    });
    const d = await svc.report(reporter, cmd);
    const entries = await svc.audit(lead, d.id);
    expect(entries.map((e) => e.action)).toContain('IncidentCreated');
  });
  it('rejectReopensIncident', async () => {
    const { svc } = await setup();
    const d = await svc.report(employee, cmd);
    await svc.acknowledge(technician, d.id);
    await svc.startWork(technician, d.id);
    await svc.resolve(technician, d.id, 'Fixed router');
    expect((await svc.reject(employee, d.id, 'Still broken')).status).toBe('REOPENED');
  });
  it('closeAsDuplicateRequiresExistingTarget', async () => {
    const { svc } = await setup();
    const d = await svc.report(employee, cmd);
    await expect(svc.closeAsDuplicate(admin, d.id, 'missing')).rejects.toBeInstanceOf(
      IncidentNotFoundException,
    );
  });
  it('resolveGrowsTechnicianServiceExperience', async () => {
    const { svc, users } = await setup();
    const d = await svc.report(employee, cmd);
    await svc.acknowledge(technician, d.id);
    await svc.startWork(technician, d.id);
    await svc.resolve(technician, d.id, 'Fixed router');
    expect(
      ((await users.findById(technician.id())) as Technician).experienceWith(service.id()),
    ).toBe(1);
  });
  it('recommendationsReturnTopThreeWithReasons', async () => {
    const { svc, users } = await setup();
    for (let n = 1; n <= 4; n++)
      await users.save(
        Technician.rehydrate({
          ...technician.toSnapshot(),
          id: asUserId(`extra${n}`),
          email: `extra${n}@example.com`,
        } as Parameters<typeof Technician.rehydrate>[0]),
      );
    const d = await svc.report(employee, cmd);
    const rec = await svc.recommendations(admin, d.id);
    expect(rec).toHaveLength(3);
    expect(rec.every((r) => r.reasons.length > 0)).toBe(true);
  });
  it('manualReassignmentExplainsWhoChoseTheTechnicianAndWhy', async () => {
    const { svc, users, tech } = await setup();
    const d = await svc.report(employee, cmd);
    expect(d.assignee?.id).toBe(tech.id());
    await users.save(otherTechnician);
    const lead = TeamLead.rehydrate({
      ...(tech.toSnapshot() as Parameters<typeof Technician.rehydrate>[0]),
      id: asUserId('divya'),
      name: 'Divya Rao',
      email: 'divya@example.com',
      role: Role.TEAM_LEAD,
      team: [tech.id(), otherTechnician.id()],
    });
    const [suggestion] = await svc.recommendations(lead, d.id);
    expect(suggestion?.technician.id).toBe(otherTechnician.id());
    expect(suggestion?.reasons).toContain('0/2 active incidents');
    const reasons = ['chosen by Divya Rao from the advisory suggestions', ...suggestion!.reasons];

    const reassigned = await svc.assign(lead, d.id, otherTechnician.id());
    expect(reassigned.assignee?.id).toBe(otherTechnician.id());
    expect(reassigned.assignmentReasons).toEqual(reasons);
    expect((await svc.get(lead, d.id)).assignmentReasons).toEqual(reasons);
  });
  it('manualReassignmentOmitsNegativeSkillReasonsFromExplanation', async () => {
    const { svc, users } = await setup();
    const d = await svc.report(employee, cmd);
    const chosen = Technician.rehydrate({
      ...(otherTechnician.toSnapshot() as Parameters<typeof Technician.rehydrate>[0]),
      skills: ['database'],
    });
    await users.save(chosen);
    const suggestions = await svc.recommendations(admin, d.id);
    const match = suggestions.find((r) => r.technician.id === chosen.id());
    expect(match?.reasons).toContain('lacks network skill');

    const result = await svc.assign(admin, d.id, chosen.id());
    expect(result.assignmentReasons).toEqual([
      'chosen by Admin from the advisory suggestions',
      '0/2 active incidents',
      'resolved 0 incidents on this service · 2 years experience',
    ]);
  });
  it('manualAssignmentOutsideTopSuggestionsSaysWhoChoseWithoutAdvisoryClaim', async () => {
    const { svc, users } = await setup();
    const d = await svc.report(employee, cmd);
    for (let n = 1; n <= 3; n++)
      await users.save(
        Technician.rehydrate({
          ...(technician.toSnapshot() as Parameters<typeof Technician.rehydrate>[0]),
          id: asUserId(`extra${n}`),
          email: `extra${n}@example.com`,
        }),
      );
    const chosen = Technician.rehydrate({
      ...(otherTechnician.toSnapshot() as Parameters<typeof Technician.rehydrate>[0]),
      skills: ['database'],
    });
    await users.save(chosen);
    const suggestions = await svc.recommendations(admin, d.id);
    expect(suggestions.map((r) => r.technician.id)).not.toContain(chosen.id());

    const result = await svc.assign(admin, d.id, chosen.id());
    expect(result.assignmentReasons).toEqual(['chosen by Admin']);
    expect((await svc.get(admin, d.id)).assignmentReasons).toEqual(['chosen by Admin']);
  });
  it('manualAssignmentOfUnrankedTechnicianSaysWhoChose', async () => {
    const { svc, users, assigner } = await setup();
    const d = await svc.report(employee, cmd);
    await users.save(otherTechnician);
    vi.spyOn(assigner, 'recommend').mockReturnValue([]);

    const result = await svc.assign(admin, d.id, otherTechnician.id());
    expect(result.assignee?.id).toBe(otherTechnician.id());
    expect(result.assignmentReasons).toEqual(['chosen by Admin']);
    expect((await svc.get(admin, d.id)).assignmentReasons).toEqual(['chosen by Admin']);
  });
});
describe('KeywordCategorySuggester rules', () => {
  it('keywordSuggesterPicksDatabaseForSlowQueries', async () => {
    expect(
      (
        await new KeywordCategorySuggester().suggest('slow database queries', [app, database])
      ).category.id(),
    ).toBe(database.id());
  });
  it('keywordSuggesterFallsBackToApplication', async () => {
    expect(
      await new KeywordCategorySuggester().suggest('something odd', [app, database]),
    ).toMatchObject({
      category: app,
      confidence: 0.2,
    });
  });
});

it('listFiltersByDateRangeCategoryAndSla', async () => {
  const { incidents, svc } = await setup();
  const { Incident } = await import('../../domain/incidents/index.js');
  const { snapshot } = await import('../../domain/incidents/test-fixtures.js');
  const base = snapshot('ASSIGNED');
  await incidents.save(
    Incident.rehydrate({ ...base, slaClock: { ...base.slaClock!, breached: ['RESPONSE'] } }),
  );
  expect(
    await svc.list(admin, {
      limit: 10,
      from: '2026-11-03',
      to: '2026-11-03',
      categoryId: base.categoryId!,
      sla: 'BREACHED',
    }),
  ).toHaveLength(1);
  expect(await svc.list(admin, { limit: 10, from: '2026-11-04', sla: 'BREACHED' })).toHaveLength(0);
  expect(
    await svc.list(admin, { limit: 10, categoryId: base.categoryId!, sla: 'WITHIN_SLA' }),
  ).toHaveLength(0);
});
