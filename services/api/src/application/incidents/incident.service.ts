import {
  AuditEntrySchema,
  type CreateIncidentRequest,
  type IncidentListQuery,
} from '@itsm/contracts';
import { Logger } from '@nestjs/common';
import {
  AssignmentContext,
  TechnicianLoad,
  type TechnicianAssigner,
} from '../../domain/assignment/index.js';
import {
  IncidentNotFoundException,
  InvalidInputException,
  TechnicianUnavailableException,
  WorkloadExceededException,
} from '../../domain/exceptions/index.js';
import { Actor, IncidentFactory, type Incident } from '../../domain/incidents/index.js';
import { PriorityInput, type PriorityStrategyRegistry } from '../../domain/priority/index.js';
import {
  asCategoryId,
  asIncidentId,
  asItServiceId,
  asUserId,
  Impact,
  Rating,
  Urgency,
  type Clock,
  type IncidentId,
  type UserId,
} from '../../domain/shared/index.js';
import { SlaCatalog } from '../../domain/sla/index.js';
import { Permission as P, Technician, type User } from '../../domain/users/index.js';
import type {
  AuditRepository,
  CategoryRepository,
  CategorySuggester,
  EventPublisher,
  IncidentRepository,
  ItServiceRepository,
  SlaPolicyRepository,
  UserRepository,
} from '../../ports/index.js';
import { IncidentViewMapper } from './incident-view-mapper.js';
import { IncidentVisibility } from './incident-visibility.js';

export class IncidentService {
  private readonly logger = new Logger(IncidentService.name);
  private readonly mapper: IncidentViewMapper;
  // Demo-only explanations; the aggregate remains the sole persisted incident state.
  private readonly explanations = new Map<
    IncidentId,
    { rationale: readonly string[]; reasons: readonly string[] }
  >();
  constructor(
    private readonly incidents: IncidentRepository,
    private readonly users: UserRepository,
    private readonly services: ItServiceRepository,
    private readonly categories: CategoryRepository,
    private readonly policies: SlaPolicyRepository,
    private readonly suggester: CategorySuggester,
    private readonly priorities: PriorityStrategyRegistry,
    private readonly assigner: TechnicianAssigner,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
    private readonly audits: AuditRepository,
  ) {
    this.mapper = new IncidentViewMapper(incidents, users, services, categories, clock);
  }
  private detail(i: Incident) {
    const e = this.explanations.get(i.id);
    return this.mapper.detail(i, e?.rationale, e?.reasons);
  }
  private async save(i: Incident) {
    await this.incidents.save(i);
    await this.events.publish(i.pullEvents());
  }
  private async visible(user: User, id: string): Promise<Incident> {
    const i = await this.incidents.findById(asIncidentId(id));
    if (!i || !IncidentVisibility.canView(user, i)) throw new IncidentNotFoundException(id);
    return i;
  }
  private async context(i: Incident): Promise<AssignmentContext> {
    const s = i.toSnapshot();
    const [category, technicians, counts] = await Promise.all([
      s.categoryId ? this.categories.findById(s.categoryId) : null,
      this.users.listTechnicians(),
      this.incidents.countOpenByAssignee(),
    ]);
    if (!category || !i.priority())
      throw new InvalidInputException('Incident must be classified before assignment', {
        id: i.id,
      });
    return new AssignmentContext(
      i.id,
      s.serviceId,
      i.priority()!,
      category,
      technicians
        .filter((t) => t.isActive())
        .map((t) => new TechnicianLoad(t, counts.get(t.id()) ?? 0)),
    );
  }
  private async autoAssign(i: Incident, by: Actor) {
    const ctx = await this.context(i);
    const recommendation = this.assigner.pick(ctx);
    const load = ctx.candidates.find((c) => c.technician.id() === recommendation.technicianId)!;
    i.assign(load.technician, load.activeIncidents, by, this.clock.now());
    this.assigner.confirm(recommendation);
    return recommendation.reasons;
  }
  async report(user: User, cmd: CreateIncidentRequest) {
    user.require(P.INCIDENT_REPORT);
    const serviceId = asItServiceId(cmd.serviceId);
    const [identity, service, open, categories, policies] = await Promise.all([
      this.incidents.nextIdentity(),
      this.services.findById(serviceId),
      this.incidents.findOpenByReporter(user.id()),
      this.categories.listActive(),
      this.policies.listAll(),
    ]);
    const now = this.clock.now();
    const i = IncidentFactory.report(
      {
        title: cmd.title,
        description: cmd.description,
        reporterId: user.id(),
        serviceId,
        impact: Impact.of(cmd.impact),
        urgency: Urgency.of(cmd.urgency),
        affectedUsers: cmd.affectedUsers,
      },
      { ...identity, at: now, service: service ?? undefined, openIncidentsOfReporter: open },
    );
    const intakeCategory = categories.find((category) => category.id() === cmd.categoryId);
    const category =
      intakeCategory ??
      (await this.suggester.suggest(`${cmd.title} ${cmd.description}`, categories)).category;
    if (intakeCategory)
      this.logger.log(`category ${intakeCategory.toSnapshot().code} from chat intake`);
    const assessment = this.priorities
      .active()
      .assess(
        new PriorityInput(
          Impact.of(cmd.impact),
          Urgency.of(cmd.urgency),
          service!.businessCriticality(),
          cmd.affectedUsers,
        ),
      );
    i.classify(
      category,
      assessment.priority,
      new SlaCatalog(policies).resolve(serviceId, assessment.priority),
      Actor.system(),
      now,
    );
    let reasons: readonly string[] = [];
    try {
      reasons = await this.autoAssign(i, Actor.system());
    } catch (e) {
      if (!(e instanceof TechnicianUnavailableException || e instanceof WorkloadExceededException))
        throw e;
    }
    await this.save(i);
    this.explanations.set(i.id, { rationale: assessment.rationale, reasons });
    return this.detail(i);
  }
  async list(user: User, query: IncidentListQuery) {
    const filter = {
      limit: query.limit,
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to
        ? { to: new Date(query.to.length === 10 ? `${query.to}T23:59:59.999Z` : query.to) }
        : {}),
      ...(query.categoryId ? { categoryId: asCategoryId(query.categoryId) } : {}),
      ...(query.sla ? { sla: query.sla } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.serviceId ? { serviceId: asItServiceId(query.serviceId) } : {}),
      ...(query.q ? { q: query.q } : {}),
    };
    let assigneeId: UserId | undefined = query.assigneeId ? asUserId(query.assigneeId) : undefined;
    let reporterId: UserId | undefined;
    if (!user.can(P.INCIDENT_VIEW_ALL)) {
      if (user.can(P.INCIDENT_VIEW_ASSIGNED)) {
        if (assigneeId && assigneeId !== user.id()) return [];
        assigneeId = user.id();
      } else {
        user.require(P.INCIDENT_VIEW_OWN);
        reporterId = user.id();
      }
    }
    const result = await this.incidents.search({
      ...filter,
      ...(assigneeId ? { assigneeId } : {}),
      ...(reporterId ? { reporterId } : {}),
    });
    return Promise.all(result.map((i) => this.mapper.summary(i)));
  }
  async get(user: User, id: string) {
    return this.detail(await this.visible(user, id));
  }
  private async command(
    user: User,
    id: string,
    permission: (typeof P)[keyof typeof P],
    action: (i: Incident, actor: Actor) => void | Promise<void>,
  ) {
    const i = await this.visible(user, id);
    user.require(permission);
    // Record any SLA crossing first, so a breach can't slip between monitor sweeps (e.g. a fast close).
    i.checkSla(this.clock.now());
    await action(i, Actor.user(user));
    await this.save(i);
    return this.detail(i);
  }
  async assign(user: User, id: string, technicianId?: string) {
    let reasons: readonly string[] = [];
    const result = await this.command(user, id, P.INCIDENT_ASSIGN, async (i, actor) => {
      if (!technicianId) reasons = await this.autoAssign(i, actor);
      else {
        const tech = await this.users.findById(asUserId(technicianId));
        if (!(tech instanceof Technician))
          throw new InvalidInputException('Technician not found', { technicianId });
        if (!tech.isActive()) throw new TechnicianUnavailableException();
        const counts = await this.incidents.countOpenByAssignee();
        i.assign(tech, counts.get(tech.id()) ?? 0, actor, this.clock.now());
      }
    });
    const key = asIncidentId(id);
    const e = this.explanations.get(key);
    this.explanations.set(key, { rationale: e?.rationale ?? [], reasons });
    return { ...result, assignmentReasons: [...reasons] };
  }
  acknowledge(u: User, id: string) {
    return this.command(u, id, P.INCIDENT_WORK, (i, a) => i.acknowledge(a, this.clock.now()));
  }
  startWork(u: User, id: string) {
    return this.command(u, id, P.INCIDENT_WORK, (i, a) => i.startWork(a, this.clock.now()));
  }
  addNote(u: User, id: string, text: string) {
    return this.command(
      u,
      id,
      u.can(P.INCIDENT_VIEW_ALL)
        ? P.INCIDENT_VIEW_ALL
        : u.can(P.INCIDENT_WORK)
          ? P.INCIDENT_WORK
          : P.INCIDENT_VERIFY_OWN,
      (i, a) => i.addNote(text, a, this.clock.now()),
    );
  }
  requestInfo(u: User, id: string, question: string) {
    return this.command(u, id, P.INCIDENT_WORK, (i, a) =>
      i.requestInfo(question, a, this.clock.now()),
    );
  }
  provideInfo(u: User, id: string, answer: string) {
    return this.command(u, id, P.INCIDENT_VERIFY_OWN, (i, a) =>
      i.provideInfo(answer, a, this.clock.now()),
    );
  }
  resolve(u: User, id: string, summary: string, rootCause?: string) {
    return this.command(u, id, P.INCIDENT_WORK, async (i, a) => {
      i.resolve(summary, rootCause, a, this.clock.now());
      const tech = await this.users.findById(u.id());
      if (!(tech instanceof Technician))
        throw new InvalidInputException('Assignee is not a technician', { id: u.id() });
      tech.recordResolvedFor(i.toSnapshot().serviceId);
      await this.users.save(tech);
    });
  }
  verify(u: User, id: string) {
    return this.command(u, id, P.INCIDENT_VERIFY_OWN, (i, a) => i.verify(a, this.clock.now()));
  }
  reject(u: User, id: string, reason: string) {
    return this.command(u, id, P.INCIDENT_VERIFY_OWN, (i, a) =>
      i.reject(reason, a, this.clock.now()),
    );
  }
  feedback(u: User, id: string, rating: number, comment?: string) {
    return this.command(u, id, P.INCIDENT_FEEDBACK, (i, a) =>
      i.giveFeedback(Rating.of(rating), comment, a, this.clock.now()),
    );
  }
  close(u: User, id: string) {
    return this.command(
      u,
      id,
      u.can(P.INCIDENT_ASSIGN) ? P.INCIDENT_ASSIGN : P.INCIDENT_VERIFY_OWN,
      (i, a) => {
        if (!u.can(P.INCIDENT_ASSIGN) && i.reporterId() !== u.id()) u.require(P.INCIDENT_ASSIGN);
        i.close(a, this.clock.now());
      },
    );
  }
  closeAsDuplicate(u: User, id: string, targetId: string) {
    return this.command(u, id, P.INCIDENT_ASSIGN, async (i, a) => {
      const target = await this.incidents.findById(asIncidentId(targetId));
      if (!target) throw new IncidentNotFoundException(targetId);
      i.closeAsDuplicate(target.id, a, this.clock.now());
    });
  }
  async recommendations(u: User, id: string) {
    const i = await this.visible(u, id);
    u.require(P.INCIDENT_ASSIGN);
    const ctx = await this.context(i);
    return this.assigner.recommend(ctx, 3).map((r) => {
      const tech = ctx.candidates.find((c) => c.technician.id() === r.technicianId)!.technician;
      return {
        technician: { id: tech.id(), name: tech.name() },
        score: r.score,
        reasons: [...r.reasons],
        strategy: r.strategy,
      };
    });
  }
  async audit(u: User, id: string) {
    // Anyone who may see the incident may read its history; the global audit search stays on AUDIT_VIEW.
    const i = await this.visible(u, id);
    const records = await this.audits.listByIncident(i.id);
    const label = await this.auditLabels(i);
    return Promise.all(
      records.map(async (r) => {
        const s = r.toSnapshot();
        const actor = s.actorId ? await this.users.findById(s.actorId) : null;
        return AuditEntrySchema.parse({
          at: s.at,
          actor: actor ? { id: actor.id(), name: actor.name() } : null,
          action: s.action,
          fromStatus: s.fromStatus,
          toStatus: s.toStatus,
          description: s.description.replace(UUID, (id) => label.get(id) ?? id),
        });
      }),
    );
  }
  /** Readable names for ids that domain events embed, so the audit trail reads like the spec's example. */
  private async auditLabels(i: Incident): Promise<Map<string, string>> {
    const snapshot = i.toSnapshot();
    const [users, services, categories] = await Promise.all([
      Promise.all(
        [snapshot.reporterId, snapshot.assigneeId]
          .concat(snapshot.notes.map((n) => n.authorId))
          .filter((x): x is UserId => !!x)
          .map((id) => this.users.findById(id)),
      ),
      this.services.findById(snapshot.serviceId),
      this.categories.listActive(),
    ]);
    const labels = new Map<string, string>([[i.id, i.number.toString()]]);
    for (const user of users) if (user) labels.set(user.id(), `${user.name()} (${user.role()})`);
    // Past assignees no longer on the incident still appear in older events; resolve them lazily below.
    if (services) labels.set(services.id(), services.name());
    for (const c of categories) labels.set(c.id(), c.toSnapshot().code);
    const records = await this.audits.listByIncident(i.id);
    for (const r of records)
      for (const id of r.toSnapshot().description.match(UUID) ?? [])
        if (!labels.has(id)) {
          const user = await this.users.findById(asUserId(id));
          if (user) labels.set(id, `${user.name()} (${user.role()})`);
          if (snapshot.duplicateOfId === id) {
            const original = await this.incidents.findById(snapshot.duplicateOfId);
            if (original) labels.set(id, original.number.toString());
          }
        }
    return labels;
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
