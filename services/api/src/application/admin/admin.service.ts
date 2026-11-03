import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  AuditLogEntrySchema,
  type CreateUserRequestSchema,
  type UpdateUserRequestSchema,
  type CreateServiceRequestSchema,
  type UpdateServiceRequestSchema,
  type CreateCategoryRequestSchema,
  type UpdateCategoryRequestSchema,
  type UpsertSlaPolicyRequestSchema,
  type UpdateStrategiesRequestSchema,
  type AuditSearchQuerySchema,
} from '@itsm/contracts';
import { AssignmentStrategyRegistry } from '../../domain/assignment/index.js';
import { PriorityStrategyRegistry } from '../../domain/priority/index.js';
import { Category, ItService } from '../../domain/catalog/index.js';
import {
  ConfigItemNotFoundException,
  InvalidInputException,
} from '../../domain/exceptions/index.js';
import {
  asCategoryId,
  asItServiceId,
  asSlaPolicyId,
  asUserId,
  asIncidentId,
  BusinessCriticality,
  Duration,
  Email,
  SkillTag,
  type SlaPolicyId,
} from '../../domain/shared/index.js';
import { SlaPolicy, SlaTarget } from '../../domain/sla/index.js';
import {
  Employee,
  Permission,
  Technician,
  UserFactory,
  type User,
} from '../../domain/users/index.js';
import type {
  AuditRepository,
  CategoryRepository,
  ItServiceRepository,
  PasswordHasher,
  SlaPolicyRepository,
  UserRepository,
} from '../../ports/index.js';

type Input<T extends z.ZodType> = z.infer<T>;
const missing = (kind: string, id: string): never => {
  throw new ConfigItemNotFoundException(kind, id);
};
const serviceView = (service: ItService) => {
  const s = service.toSnapshot();
  return {
    id: s.id,
    name: s.name,
    criticality: s.criticality,
    description: s.description ?? null,
    active: s.active,
  };
};
const categoryView = (category: Category) => category.toSnapshot();

export class AdminService {
  constructor(
    private readonly users: UserRepository,
    private readonly services: ItServiceRepository,
    private readonly categories: CategoryRepository,
    private readonly policies: SlaPolicyRepository,
    private readonly audit: AuditRepository,
    private readonly hasher: PasswordHasher,
    private readonly priority: PriorityStrategyRegistry,
    private readonly assignment: AssignmentStrategyRegistry,
  ) {}
  private async userView(user: User) {
    const s = user.toSnapshot();
    const technician =
      user instanceof Technician
        ? {
            skills: [...user.skills()].map((v) => v.value),
            capacity: user.capacity(),
            availability: user.availabilityStatus(),
            experienceYears: user.experience(),
          }
        : null;
    const teamIds = s.role === 'TEAM_LEAD' ? s.team : [];
    const team = (await Promise.all(teamIds.map((id) => this.users.findById(id))))
      .filter((u): u is User => u !== null)
      .map((u) => ({ id: u.id(), name: u.name() }));
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      active: s.active,
      department: s.role === 'EMPLOYEE' ? s.department : null,
      technician,
      team,
    };
  }
  async listUsers(actor: User) {
    actor.require(Permission.CONFIG_MANAGE);
    return Promise.all((await this.users.listAll()).map((u) => this.userView(u)));
  }
  async createUser(actor: User, input: Input<typeof CreateUserRequestSchema>) {
    actor.require(Permission.CONFIG_MANAGE);
    const email = Email.of(input.email);
    if (await this.users.findByEmail(email))
      throw new InvalidInputException('Email already exists.', { field: 'email' });
    const user = UserFactory.create({
      ...input,
      id: asUserId(randomUUID()),
      email: email.value,
      passwordHash: await this.hasher.hash(input.password),
    });
    await this.users.save(user);
    return this.userView(user);
  }
  async updateUser(actor: User, id: string, input: Input<typeof UpdateUserRequestSchema>) {
    actor.require(Permission.CONFIG_MANAGE);
    const user = (await this.users.findById(asUserId(id))) ?? missing('User', id);
    if (input.name !== undefined) user.rename(input.name);
    if (input.active === true) user.activate();
    else if (input.active === false) user.deactivate();
    if (input.department !== undefined) {
      if (!(user instanceof Employee))
        throw new InvalidInputException('Department requires an employee.', {
          field: 'department',
        });
      user.changeDepartment(input.department);
    }
    if (
      input.skills !== undefined ||
      input.maxActiveIncidents !== undefined ||
      input.availability !== undefined ||
      input.experienceYears !== undefined
    ) {
      if (!(user instanceof Technician))
        throw new InvalidInputException('Technician fields require a technician.', {});
      if (input.skills !== undefined) {
        if (!input.skills.length)
          throw new InvalidInputException('At least one skill is required.', { field: 'skills' });
        const skills = input.skills.map((skill) => SkillTag.of(skill));
        for (const skill of skills) user.addSkill(skill);
        for (const skill of user.skills())
          if (!skills.some((s) => s.value === skill.value)) user.removeSkill(skill);
      }
      if (input.maxActiveIncidents !== undefined) user.setCapacity(input.maxActiveIncidents);
      if (input.availability !== undefined) user.setAvailability(input.availability);
      if (input.experienceYears !== undefined) user.setExperienceYears(input.experienceYears);
    }
    await this.users.save(user);
    return this.userView(user);
  }
  private async requireUniqueServiceName(name: string) {
    if ((await this.services.listAll()).some((s) => s.name() === name))
      throw new InvalidInputException('Service name already exists.', { field: 'name' });
  }
  async listServices(actor: User) {
    actor.require(Permission.CONFIG_MANAGE);
    return (await this.services.listAll()).map(serviceView);
  }
  async createService(actor: User, input: Input<typeof CreateServiceRequestSchema>) {
    actor.require(Permission.CONFIG_MANAGE);
    await this.requireUniqueServiceName(input.name);
    const value = ItService.create({ ...input, id: asItServiceId(randomUUID()), active: true });
    await this.services.save(value);
    return serviceView(value);
  }
  async updateService(actor: User, id: string, input: Input<typeof UpdateServiceRequestSchema>) {
    actor.require(Permission.CONFIG_MANAGE);
    const value = (await this.services.findById(asItServiceId(id))) ?? missing('Service', id);
    if (input.name !== undefined && input.name !== value.name()) {
      await this.requireUniqueServiceName(input.name);
      value.rename(input.name);
    }
    if (input.description !== undefined) value.changeDescription(input.description);
    if (input.criticality !== undefined)
      value.changeCriticality(BusinessCriticality.of(input.criticality));
    if (input.active === true) value.activate();
    else if (input.active === false) value.deactivate();
    await this.services.save(value);
    return serviceView(value);
  }
  async listCategories(actor: User) {
    actor.require(Permission.CONFIG_MANAGE);
    return (await this.categories.listAll()).map(categoryView);
  }
  async createCategory(actor: User, input: Input<typeof CreateCategoryRequestSchema>) {
    actor.require(Permission.CONFIG_MANAGE);
    if ((await this.categories.listAll()).some((c) => c.toSnapshot().code === input.code))
      throw new InvalidInputException('Category code already exists.', { field: 'code' });
    const value = Category.create({ ...input, id: asCategoryId(randomUUID()), active: true });
    await this.categories.save(value);
    return categoryView(value);
  }
  async updateCategory(actor: User, id: string, input: Input<typeof UpdateCategoryRequestSchema>) {
    actor.require(Permission.CONFIG_MANAGE);
    const value = (await this.categories.findById(asCategoryId(id))) ?? missing('Category', id);
    if (input.name !== undefined) value.rename(input.name);
    if (input.requiredSkill !== undefined)
      value.changeRequiredSkill(SkillTag.of(input.requiredSkill));
    if (input.active === true) value.activate();
    else if (input.active === false) value.deactivate();
    await this.categories.save(value);
    return categoryView(value);
  }
  private async policyView(policy: SlaPolicy) {
    const s = policy.toSnapshot();
    const service = s.serviceId ? await this.services.findById(s.serviceId) : null;
    if (s.serviceId && !service) missing('Service', s.serviceId);
    return {
      id: s.id,
      name: s.name,
      service: service ? serviceView(service) : null,
      warningRatio: s.warningRatio,
      targets: s.targets.map(([priority, target]) => ({
        priority,
        responseMinutes: target.response / 60000,
        resolutionMinutes: target.resolution / 60000,
      })),
    };
  }
  async listPolicies(actor: User) {
    actor.require(Permission.CONFIG_MANAGE);
    return Promise.all((await this.policies.listAll()).map((p) => this.policyView(p)));
  }
  private async savePolicy(id: SlaPolicyId, input: Input<typeof UpsertSlaPolicyRequestSchema>) {
    const serviceId = input.serviceId ? asItServiceId(input.serviceId) : null;
    if (serviceId && !(await this.services.findById(serviceId))) missing('Service', serviceId);
    const others = (await this.policies.listAll()).filter((p) => p.id() !== id);
    if (serviceId === null && others.some((p) => p.serviceId() === null))
      throw new InvalidInputException('Only one default SLA policy is allowed.', {
        field: 'serviceId',
      });
    if (serviceId !== null && others.some((p) => p.serviceId() === serviceId))
      throw new InvalidInputException('This service already has an SLA policy.', {
        field: 'serviceId',
      });
    // Incidents on services without their own policy fall back to the default, so it must stay.
    if (serviceId !== null && !others.some((p) => p.serviceId() === null))
      throw new InvalidInputException('A default SLA policy is required.', { field: 'serviceId' });
    const policy = SlaPolicy.create({
      id,
      name: input.name,
      serviceId,
      warningRatio: input.warningRatio,
      targets: new Map(
        input.targets.map((t) => [
          t.priority,
          SlaTarget.of(
            Duration.ofMinutes(t.responseMinutes),
            Duration.ofMinutes(t.resolutionMinutes),
          ),
        ]),
      ),
    });
    await this.policies.save(policy);
    return this.policyView(policy);
  }
  async createPolicy(actor: User, input: Input<typeof UpsertSlaPolicyRequestSchema>) {
    actor.require(Permission.CONFIG_MANAGE);
    return this.savePolicy(asSlaPolicyId(randomUUID()), input);
  }
  async updatePolicy(actor: User, id: string, input: Input<typeof UpsertSlaPolicyRequestSchema>) {
    actor.require(Permission.CONFIG_MANAGE);
    const policyId = asSlaPolicyId(id);
    if (!(await this.policies.findById(policyId))) missing('SLA policy', id);
    return this.savePolicy(policyId, input);
  }
  strategies(actor: User) {
    actor.require(Permission.CONFIG_MANAGE);
    return {
      priority: { active: this.priority.active().name, available: [...this.priority.names()] },
      assignment: { active: this.assignment.active().name, available: this.assignment.names() },
    };
  }
  updateStrategies(actor: User, input: Input<typeof UpdateStrategiesRequestSchema>) {
    actor.require(Permission.CONFIG_MANAGE);
    // Registry selections live in memory for the demo and reset when the API restarts.
    if (input.priority !== undefined && !this.priority.names().includes(input.priority))
      throw new InvalidInputException('Unknown priority strategy.', { name: input.priority });
    if (input.assignment !== undefined && !this.assignment.names().includes(input.assignment))
      throw new InvalidInputException('Unknown assignment strategy.', { name: input.assignment });
    if (input.priority !== undefined) this.priority.use(input.priority);
    if (input.assignment !== undefined) this.assignment.use(input.assignment);
    return this.strategies(actor);
  }
  async searchAudit(actor: User, input: Input<typeof AuditSearchQuerySchema>) {
    actor.require(Permission.AUDIT_VIEW);
    const rows = await this.audit.search({
      ...(input.incidentId ? { incidentId: asIncidentId(input.incidentId) } : {}),
      ...(input.actorId ? { actorId: asUserId(input.actorId) } : {}),
      ...(input.action ? { action: input.action } : {}),
      ...(input.from ? { from: new Date(input.from) } : {}),
      ...(input.to ? { to: new Date(input.to) } : {}),
      limit: input.limit,
    });
    return Promise.all(
      rows.map(async ({ record, incidentNumber }) => {
        const s = record.toSnapshot();
        const user = s.actorId ? await this.users.findById(s.actorId) : null;
        return AuditLogEntrySchema.parse({
          at: s.at,
          actor: user ? { id: user.id(), name: user.name() } : null,
          action: s.action,
          fromStatus: s.fromStatus,
          toStatus: s.toStatus,
          description: s.description,
          incident: { id: s.incidentId, number: incidentNumber },
        });
      }),
    );
  }
}
