import { describe, expect, it } from 'vitest';
import { AssignmentStrategyRegistry, TechnicianAssigner } from '../../domain/assignment/index.js';
import {
  InvalidCredentialsException,
  InvalidInputException,
  UnauthorizedOperationException,
} from '../../domain/exceptions/index.js';
import { at, employee, service } from '../../domain/incidents/test-fixtures.js';
import {
  MatrixPriorityStrategy,
  PriorityStrategyRegistry,
  WeightedScorePriorityStrategy,
} from '../../domain/priority/index.js';
import { asAuditId, asSlaPolicyId, asUserId, FixedClock } from '../../domain/shared/index.js';
import { SlaPolicy } from '../../domain/sla/index.js';
import { Admin, Employee, Role } from '../../domain/users/index.js';
import { AuthService } from '../auth/auth.service.js';
import { fakeHasher } from '../auth/testing.js';
import { AuditRecorder } from '../audit/audit-recorder.js';
import { InProcessEventPublisher } from '../events/in-process-event-publisher.js';
import { IncidentService } from '../incidents/incident.service.js';
import { KeywordCategorySuggester } from '../incidents/keyword-category-suggester.js';
import { InMemoryAuditRepository } from '../testing/in-memory-audit-repository.js';
import { InMemoryCategoryRepository } from '../testing/in-memory-category-repository.js';
import { InMemoryIncidentRepository } from '../testing/in-memory-incident-repository.js';
import { InMemoryServiceRepository } from '../testing/in-memory-service-repository.js';
import { InMemorySlaPolicyRepository } from '../testing/in-memory-sla-policy-repository.js';
import { InMemoryUserRepository } from '../testing/in-memory-user-repository.js';
import { AdminService } from './admin.service.js';
import type { TokenService } from '../../ports/index.js';

const admin = Admin.rehydrate({
  id: asUserId('admin'),
  name: 'Admin',
  email: 'admin@example.com',
  passwordHash: 'hash',
  active: true,
});
const reporter = Employee.rehydrate({
  ...employee.toSnapshot(),
  id: asUserId('11111111-1111-4111-8111-111111111111'),
});
const createTech = {
  name: 'Printer expert',
  email: 'tech@example.com',
  password: 'password',
  role: Role.TECHNICIAN,
  skills: ['printing'],
  maxActiveIncidents: 3,
  experienceYears: 4,
};
async function setup() {
  const users = new InMemoryUserRepository(),
    services = new InMemoryServiceRepository(),
    categories = new InMemoryCategoryRepository(),
    policies = new InMemorySlaPolicyRepository(),
    incidents = new InMemoryIncidentRepository();
  const audit = new InMemoryAuditRepository(incidents);
  const priority = new PriorityStrategyRegistry(
    [new WeightedScorePriorityStrategy(), new MatrixPriorityStrategy()],
    'weighted-score',
  );
  const assignment = AssignmentStrategyRegistry.withDefaults();
  const adminService = new AdminService(
    users,
    services,
    categories,
    policies,
    audit,
    fakeHasher,
    priority,
    assignment,
  );
  await users.save(reporter);
  await users.save(admin);
  await services.save(service);
  await policies.save(SlaPolicy.specDefault(asSlaPolicyId('default')));
  const events = new InProcessEventPublisher();
  let n = 0;
  events.subscribe(new AuditRecorder(audit, () => asAuditId(`audit-${++n}`)));
  const incidentService = new IncidentService(
    incidents,
    users,
    services,
    categories,
    policies,
    new KeywordCategorySuggester(),
    priority,
    new TechnicianAssigner(assignment),
    events,
    new FixedClock(at),
    audit,
  );
  return { adminService, incidentService, users, priority, assignment };
}
const report = {
  title: 'Printing queue is stuck',
  description: 'The printing queue is stuck for everyone',
  serviceId: service.id(),
  impact: 2,
  urgency: 2,
  affectedUsers: 5,
};
const policy = {
  name: 'Changed',
  serviceId: null,
  warningRatio: 0.8,
  targets: (['P1', 'P2', 'P3', 'P4'] as const).map((priority) => ({
    priority,
    responseMinutes: 3,
    resolutionMinutes: 10,
  })),
};
describe('admin configuration', () => {
  it('adminCreatesTechnicianWithSkills', async () => {
    const { adminService, users } = await setup();
    const user = await adminService.createUser(admin, createTech);
    expect(user.technician).toMatchObject({ skills: ['printing'], capacity: 3 });
    expect((await users.findById(asUserId(user.id)))?.toSnapshot().passwordHash).toBe(
      'hashed:password',
    );
  });
  it('rejectsDuplicateEmailOnAdminCreate', async () => {
    const { adminService } = await setup();
    await adminService.createUser(admin, createTech);
    await expect(
      adminService.createUser(admin, { ...createTech, email: 'TECH@example.com' }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });
  it('nonAdminCannotManageConfig', async () => {
    const { adminService } = await setup();
    await expect(adminService.listUsers(employee)).rejects.toBeInstanceOf(
      UnauthorizedOperationException,
    );
    await expect(adminService.createUser(employee, createTech)).rejects.toBeInstanceOf(
      UnauthorizedOperationException,
    );
  });
  it('deactivatedUserCannotLogIn', async () => {
    const { adminService, users } = await setup();
    const u = await adminService.createUser(admin, createTech);
    await adminService.updateUser(admin, u.id, { active: false });
    const auth = new AuthService(users, fakeHasher, {} as TokenService);
    await expect(auth.login(createTech.email, createTech.password)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });
  it('newCategoryIsUsableWithoutCodeChange', async () => {
    const { adminService, incidentService } = await setup();
    await adminService.createCategory(admin, {
      code: 'PRINTING',
      name: 'Printing',
      requiredSkill: 'printing',
    });
    await adminService.createUser(admin, createTech);
    expect((await incidentService.report(reporter, report)).category?.code).toBe('PRINTING');
  });
  it('technicianOnLeaveIsSkippedByAutoAssign', async () => {
    const { adminService, incidentService } = await setup();
    await adminService.createCategory(admin, {
      code: 'PRINTING',
      name: 'Printing',
      requiredSkill: 'printing',
    });
    const tech = await adminService.createUser(admin, createTech);
    await adminService.updateUser(admin, tech.id, { availability: 'ON_LEAVE' });
    expect((await incidentService.report(reporter, report)).assignee).toBeNull();
  });
  it('cannotCreateSecondDefaultSlaPolicy', async () => {
    const { adminService } = await setup();
    await expect(adminService.createPolicy(admin, policy)).rejects.toBeInstanceOf(
      InvalidInputException,
    );
  });
  it('rejectsSecondSlaPolicyForSameService', async () => {
    const { adminService } = await setup();
    await adminService.createPolicy(admin, { ...policy, serviceId: service.id() });
    await expect(
      adminService.createPolicy(admin, { ...policy, serviceId: service.id() }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });
  it('cannotRemoveTheDefaultSlaPolicy', async () => {
    const { adminService } = await setup();
    await expect(
      adminService.updatePolicy(admin, 'default', { ...policy, serviceId: service.id() }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });
  it('rejectsDuplicateCategoryCodeAndServiceName', async () => {
    const { adminService } = await setup();
    const printing = { code: 'PRINTING', name: 'Printing', requiredSkill: 'printing' };
    await adminService.createCategory(admin, printing);
    await expect(adminService.createCategory(admin, printing)).rejects.toBeInstanceOf(
      InvalidInputException,
    );
    await expect(
      adminService.createService(admin, { name: service.name(), criticality: 2 }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });
  it('deactivatedTechnicianIsSkippedByAutoAssign', async () => {
    const { adminService, incidentService } = await setup();
    await adminService.createCategory(admin, {
      code: 'PRINTING',
      name: 'Printing',
      requiredSkill: 'printing',
    });
    const tech = await adminService.createUser(admin, createTech);
    await adminService.updateUser(admin, tech.id, { active: false });
    expect((await incidentService.report(reporter, report)).assignee).toBeNull();
  });
  it('slaPolicyUpdateAppliesToNewIncidents', async () => {
    const { adminService, incidentService } = await setup();
    await adminService.updatePolicy(admin, 'default', policy);
    await adminService.createCategory(admin, {
      code: 'PRINTING',
      name: 'Printing',
      requiredSkill: 'printing',
    });
    const result = await incidentService.report(reporter, report);
    expect(
      new Date(result.slaDeadlines!.resolution).getTime() - new Date(result.createdAt).getTime(),
    ).toBe(600000);
  });
  it('serviceCriticalityChangeAffectsNewPriorities', async () => {
    const { adminService, incidentService } = await setup();
    await adminService.createCategory(admin, {
      code: 'PRINTING',
      name: 'Printing',
      requiredSkill: 'printing',
    });
    await adminService.updateService(admin, service.id(), { criticality: 1 });
    const first = await incidentService.report(reporter, {
      ...report,
      impact: 4,
      urgency: 4,
      affectedUsers: 1,
    });
    await adminService.updateService(admin, service.id(), { criticality: 4 });
    const second = await incidentService.report(reporter, {
      ...report,
      title: 'Another printing problem',
      impact: 4,
      urgency: 4,
      affectedUsers: 1,
    });
    expect(first.priority).toBe('P2');
    expect(second.priority).toBe('P1');
  });
  it('switchingAssignmentStrategyChangesPick', async () => {
    const { adminService, incidentService } = await setup();
    await adminService.createCategory(admin, {
      code: 'PRINTING',
      name: 'Printing',
      requiredSkill: 'printing',
    });
    const first = await adminService.createUser(admin, { ...createTech, experienceYears: 0 });
    const second = await adminService.createUser(admin, {
      ...createTech,
      email: 'other@example.com',
      experienceYears: 0,
    });
    const preferred = [first.id, second.id].sort()[1]!;
    await adminService.updateUser(admin, preferred, { experienceYears: 50 });
    const composite = await incidentService.report(reporter, report);
    expect(composite.assignee?.id).toBe(preferred);
    adminService.updateStrategies(admin, { assignment: 'round-robin' });
    const next = await incidentService.report(reporter, {
      ...report,
      title: 'Another printing problem',
    });
    expect(next.assignee?.id).toBe([first.id, second.id].sort()[0]);
  });
  it('switchingPriorityStrategyToMatrix', async () => {
    const { adminService, priority } = await setup();
    adminService.updateStrategies(admin, { priority: 'impact-urgency-matrix' });
    expect(priority.active().name).toBe('impact-urgency-matrix');
  });
  it('auditSearchFiltersByActionAndIncident', async () => {
    const { adminService, incidentService } = await setup();
    await adminService.createCategory(admin, {
      code: 'PRINTING',
      name: 'Printing',
      requiredSkill: 'printing',
    });
    const incident = await incidentService.report(reporter, report);
    const result = await adminService.searchAudit(admin, {
      incidentId: incident.id,
      action: 'IncidentCreated',
      limit: 100,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.incident.number).toBe(incident.number);
  });
  it('treatsADateOnlyAuditToAsTheEndOfThatDay', async () => {
    const { adminService, incidentService } = await setup();
    await adminService.createCategory(admin, {
      code: 'PRINTING',
      name: 'Printing',
      requiredSkill: 'printing',
    });
    const incident = await incidentService.report(reporter, report);
    const result = await adminService.searchAudit(admin, {
      incidentId: incident.id,
      action: 'IncidentCreated',
      to: '2026-11-03', // same day as the fixed clock, 09:00Z
      limit: 100,
    });
    expect(result).toHaveLength(1);
  });
  it('rejectsAnAdminDeactivatingTheirOwnAccount', async () => {
    const { adminService, users } = await setup();
    await expect(
      adminService.updateUser(admin, admin.id(), { active: false }),
    ).rejects.toBeInstanceOf(InvalidInputException);
    expect((await users.findById(admin.id()))?.isActive()).toBe(true);
  });
  it('auditSearchRequiresAuditView', async () => {
    const { adminService } = await setup();
    await expect(adminService.searchAudit(employee, { limit: 100 })).rejects.toBeInstanceOf(
      UnauthorizedOperationException,
    );
  });
});
