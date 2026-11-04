import type { IncidentDetail, IncidentSummary } from '@itsm/contracts';
import { IncidentNotFoundException, InvalidInputException } from '../../domain/exceptions/index.js';
import type { Incident } from '../../domain/incidents/index.js';
import type { Clock, UserId } from '../../domain/shared/index.js';
import type {
  CategoryRepository,
  IncidentRepository,
  ItServiceRepository,
  UserRepository,
} from '../../ports/index.js';

export class IncidentViewMapper {
  constructor(
    private readonly incidents: IncidentRepository,
    private readonly users: UserRepository,
    private readonly services: ItServiceRepository,
    private readonly categories: CategoryRepository,
    private readonly clock: Clock,
  ) {}
  async detail(
    incident: Incident,
    rationale: readonly string[] = [],
    reasons: readonly string[] = [],
  ): Promise<IncidentDetail> {
    const s = incident.toSnapshot();
    const ids = new Set<UserId>();
    for (const id of [
      s.reporterId,
      s.assigneeId,
      ...s.notes.map((n) => n.authorId),
      ...s.infoRequests.map((q) => q.askedBy),
      s.resolution?.resolvedBy,
      s.closure?.closedBy,
    ])
      if (id) ids.add(id);
    const [users, service, category, duplicate] = await Promise.all([
      Promise.all([...ids].map((id) => this.users.findById(id))),
      this.services.findById(s.serviceId),
      s.categoryId ? this.categories.findById(s.categoryId) : null,
      s.closure?.duplicateOfId ? this.incidents.findById(s.closure.duplicateOfId) : null,
    ]);
    const people = new Map(
      users.filter((u) => u !== null).map((u) => [u.id(), { id: u.id(), name: u.name() }]),
    );
    const person = (id: UserId | null | undefined) =>
      id ? (people.get(id) ?? { id, name: 'Unknown user' }) : null;
    if (!service)
      throw new InvalidInputException('Incident service missing', { serviceId: s.serviceId });
    if (s.closure?.duplicateOfId && !duplicate)
      throw new IncidentNotFoundException(s.closure.duplicateOfId);
    const deadlines = incident.slaDeadlines(this.clock.now());
    return {
      id: s.id,
      number: s.number,
      title: s.title,
      description: s.description,
      status: s.status,
      priority: s.priority,
      service: {
        id: service.id(),
        name: service.name(),
        criticality: service.businessCriticality().value,
      },
      category: category
        ? { id: category.id(), code: category.toSnapshot().code, name: category.name() }
        : null,
      reporter: person(s.reporterId)!,
      assignee: person(s.assigneeId),
      createdAt: s.createdAt,
      slaStatus: incident.slaStatus(this.clock.now()),
      escalationLevel: s.escalationLevel,
      impact: s.impact,
      urgency: s.urgency,
      affectedUsers: s.affectedUsers,
      slaDeadlines: deadlines
        ? { response: deadlines.response.toIso(), resolution: deadlines.resolution.toIso() }
        : null,
      priorityRationale: [...rationale],
      assignmentReasons: [...reasons],
      notes: s.notes.map((n) => ({ author: person(n.authorId)!, text: n.text, at: n.at })),
      infoRequests: s.infoRequests.map((q) => ({
        question: q.question,
        askedBy: person(q.askedBy)!,
        askedAt: q.askedAt,
        answer: q.answer ?? null,
        answeredAt: q.answeredAt ?? null,
      })),
      resolution: s.resolution
        ? {
            summary: s.resolution.summary,
            rootCause: s.resolution.rootCause ?? null,
            resolvedBy: person(s.resolution.resolvedBy)!,
            at: s.resolution.at,
          }
        : null,
      feedback: s.feedback
        ? { rating: s.feedback.rating, comment: s.feedback.comment ?? null, at: s.feedback.at }
        : null,
      closure: s.closure
        ? {
            reason: s.closure.reason,
            closedBy: person(s.closure.closedBy),
            at: s.closure.at,
            duplicateOf: duplicate ? { id: duplicate.id, number: duplicate.number.value } : null,
          }
        : null,
      reopenCount: s.reopenCount,
      allowedActions: [
        ...incident.allowedActions(),
        // Feedback is not a state transition: offered once the fix is verified, until given.
        ...((s.status === 'VERIFIED' || s.status === 'CLOSED') && !s.feedback
          ? (['giveFeedback'] as const)
          : []),
      ],
    };
  }
  async summary(incident: Incident): Promise<IncidentSummary> {
    const d = await this.detail(incident);
    return {
      id: d.id,
      number: d.number,
      title: d.title,
      status: d.status,
      priority: d.priority,
      service: d.service,
      category: d.category,
      reporter: d.reporter,
      assignee: d.assignee,
      createdAt: d.createdAt,
      slaStatus: d.slaStatus,
      escalationLevel: d.escalationLevel,
    };
  }
}
