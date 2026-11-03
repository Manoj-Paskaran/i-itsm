import { describe, expect, it } from 'vitest';
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
import { Admin, Availability, Employee, Technician } from '../../domain/users/index.js';
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
async function setup(available = true) {
  const incidents = new InMemoryIncidentRepository(),
    users = new InMemoryUserRepository(),
    services = new InMemoryServiceRepository(),
    categories = new InMemoryCategoryRepository(),
    policies = new InMemorySlaPolicyRepository(),
    audit = new InMemoryAuditRepository();
  const tech = Technician.rehydrate({
    ...technician.toSnapshot(),
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
  const svc = new IncidentService(
    incidents,
    users,
    services,
    categories,
    policies,
    new KeywordCategorySuggester(),
    new PriorityStrategyRegistry([matrix], matrix.name),
    new TechnicianAssigner(AssignmentStrategyRegistry.withDefaults()),
    events,
    clock,
    audit,
  );
  return { svc, incidents, users, services, audit, tech, clock };
}
describe('IncidentService rules', () => {
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
});
describe('KeywordCategorySuggester rules', () => {
  it('keywordSuggesterPicksDatabaseForSlowQueries', () => {
    expect(
      new KeywordCategorySuggester()
        .suggest('slow database queries', [app, database])
        .category.id(),
    ).toBe(database.id());
  });
  it('keywordSuggesterFallsBackToApplication', () => {
    expect(new KeywordCategorySuggester().suggest('something odd', [app, database])).toMatchObject({
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
