import {
  EscalationLevel,
  EscalationRequest,
  type EscalationHandler,
  type EscalationPolicy,
  type EscalationDecision,
} from '../escalation/index.js';
import type { Category } from '../catalog/index.js';
import {
  InvalidIncidentException,
  InvalidStateTransitionException,
  UnauthorizedOperationException,
} from '../exceptions/index.js';
import {
  DomainEvent,
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
  SlaWarningRaised,
  SlaBreached,
  IncidentEscalated,
  type EventContext,
} from '../events/index.js';
import {
  Impact,
  Urgency,
  IncidentNumber,
  Instant,
  Priority,
  Rating,
  type IncidentId,
  type UserId,
  type ItServiceId,
  type CategoryId,
} from '../shared/index.js';
import { SlaClock, SlaKind, type SlaStatus, type SlaTerms } from '../sla/index.js';
import { Role, type Technician } from '../users/index.js';
import { Actor } from './actor.js';
import { ClosureInfo } from './closure-info.js';
import { Feedback } from './feedback.js';
import { InfoRequest } from './info-request.js';
import { InvestigationNote } from './investigation-note.js';
import { Resolution } from './resolution.js';
import {
  IncidentStates,
  IncidentStatus,
  type IncidentAction,
  type IncidentState,
} from './state/index.js';
import type { IncidentSnapshot } from './snapshot.js';
import { incidentText } from './validation.js';

export interface ReportIncidentProps {
  readonly id: IncidentId;
  readonly number: IncidentNumber;
  readonly title: string;
  readonly description: string;
  readonly reporterId: UserId;
  readonly serviceId: ItServiceId;
  readonly impact: Impact;
  readonly urgency: Urgency;
  readonly affectedUsers: number;
  readonly at: Instant;
}

/** Aggregate root: all lifecycle, ownership and composition invariants live here. */
export class Incident {
  private readonly incidentId: IncidentId;
  private readonly incidentNumber: IncidentNumber;
  private readonly title: string;
  private readonly description: string;
  private readonly reporter: UserId;
  private readonly serviceId: ItServiceId;
  private readonly impact: Impact;
  private readonly urgency: Urgency;
  private readonly affectedUsers: number;
  private readonly createdAt: Instant;
  private categoryId: CategoryId | null = null;
  private currentPriority: Priority | null = null;
  private state: IncidentState = IncidentStates.of(IncidentStatus.NEW);
  private assignee: UserId | null = null;
  private duplicateOfId: IncidentId | null = null;
  private investigationNotes: InvestigationNote[] = [];
  private infoRequests: InfoRequest[] = [];
  private currentResolution: Resolution | null = null;
  private feedback: Feedback | null = null;
  private closure: ClosureInfo | null = null;
  private reopenCount = 0;
  private pendingEvents: DomainEvent[] = [];
  private slaClock: SlaClock | null = null;
  private currentEscalationLevel: EscalationLevel = EscalationLevel.TECHNICIAN;
  private assignedAt: Instant | null = null;

  private constructor(props: ReportIncidentProps) {
    this.incidentId = props.id;
    this.incidentNumber = props.number;
    this.title = incidentText(props.title, 'title', 3, 200);
    this.description = incidentText(props.description, 'description', 10, 5000);
    if (
      !Number.isInteger(props.affectedUsers) ||
      props.affectedUsers < 1 ||
      props.affectedUsers > 1_000_000
    )
      throw new InvalidIncidentException('affectedUsers must be an integer from 1 to 1000000');
    this.affectedUsers = props.affectedUsers;
    this.reporter = props.reporterId;
    this.serviceId = props.serviceId;
    this.impact = props.impact;
    this.urgency = props.urgency;
    this.createdAt = props.at;
  }

  static report(props: ReportIncidentProps): Incident {
    const incident = new Incident(props);
    incident.pendingEvents.push(
      new IncidentCreated(
        incident.context(Actor.of(props.reporterId, Role.EMPLOYEE), props.at, null),
        props.number,
        props.reporterId,
        props.serviceId,
      ),
    );
    return incident;
  }

  get id(): IncidentId {
    return this.incidentId;
  }
  get number(): IncidentNumber {
    return this.incidentNumber;
  }
  status(): IncidentStatus {
    return this.state.status;
  }
  priority(): Priority | null {
    return this.currentPriority;
  }
  escalationLevel(): EscalationLevel {
    return this.currentEscalationLevel;
  }
  assigneeId(): UserId | null {
    return this.assignee;
  }
  reporterId(): UserId {
    return this.reporter;
  }
  notes(): readonly InvestigationNote[] {
    return [...this.investigationNotes];
  }
  openInfoRequest(): InfoRequest | undefined {
    const request = this.infoRequests.find((r) => r.isOpen());
    return request ? InfoRequest.rehydrate(request.toSnapshot()) : undefined;
  }
  resolution(): Resolution | null {
    return this.currentResolution;
  }
  allowedActions(): ReadonlySet<IncidentAction> {
    return this.state.allowedActions();
  }
  isOpen(): boolean {
    return this.state.isOpen();
  }

  classify(category: Category, priority: Priority, sla: SlaTerms, by: Actor, at: Instant): void {
    const next = this.state.classify(this);
    if (!category.isActive()) throw new InvalidIncidentException('category must be active');
    const clock = new SlaClock(this.createdAt, sla.target, sla.warningRatio);
    const event = this.commit(next, by, at);
    this.categoryId = category.id();
    this.currentPriority = priority;
    this.slaClock = clock;
    this.pendingEvents.push(
      new IncidentClassified(event, category.id()),
      new PriorityChanged(this.context(by, at), null, priority),
    );
  }

  reprioritise(priority: Priority, sla: SlaTerms, by: Actor, at: Instant): void {
    if (this.status() === IncidentStatus.NEW || !this.isOpen())
      throw new InvalidStateTransitionException(this.status(), 'reprioritise');
    this.slaClock?.retarget(sla.target, sla.warningRatio);
    if (this.currentPriority?.equals(priority)) return;
    const previous = this.currentPriority;
    this.currentPriority = priority;
    this.pendingEvents.push(new PriorityChanged(this.context(by, at), previous, priority));
  }

  assign(technician: Technician, activeCount: number, by: Actor, at: Instant): void {
    const next = this.state.assign(this);
    technician.ensureCanTake(activeCount);
    if (this.assignee === technician.id())
      throw new InvalidIncidentException(`already assigned to ${technician.id()}`);
    const previous = this.assignee;
    const event = this.commit(next, by, at);
    this.assignee = technician.id();
    this.assignedAt = at;
    this.currentEscalationLevel = EscalationLevel.TECHNICIAN;
    this.pendingEvents.push(new IncidentAssigned(event, technician.id(), previous));
  }

  acknowledge(by: Actor, at: Instant): void {
    const next = this.state.acknowledge(this);
    this.requireAssignee(by);
    this.slaClock?.recordResponse(at);
    const event = this.commit(next, by, at);
    this.pendingEvents.push(new IncidentAcknowledged(event));
  }

  startWork(by: Actor, at: Instant): void {
    const next = this.state.startWork(this);
    this.requireAssignee(by);
    this.pendingEvents.push(new WorkStarted(this.commit(next, by, at)));
  }

  addNote(text: string, by: Actor, at: Instant): void {
    const next = this.state.addNote(this);
    if (by.role !== Role.TEAM_LEAD && by.role !== Role.ADMIN && by.role !== Role.IT_MANAGER)
      this.requireAssignee(by);
    const note = new InvestigationNote(by.id, text, at);
    const event = this.commit(next, by, at);
    this.investigationNotes.push(note);
    this.pendingEvents.push(new NoteAdded(event, note.text));
  }

  requestInfo(question: string, by: Actor, at: Instant): void {
    const next = this.state.requestInfo(this);
    this.requireAssignee(by);
    const request = new InfoRequest(question, by.id, at);
    this.slaClock?.pause(at);
    const event = this.commit(next, by, at);
    this.infoRequests.push(request);
    this.pendingEvents.push(new InfoRequested(event, request.question));
  }

  provideInfo(answer: string, by: Actor, at: Instant): void {
    const next = this.state.provideInfo(this);
    this.requireReporter(by, 'INCIDENT_VERIFY_OWN');
    const open = this.infoRequests.find((request) => request.isOpen());
    if (!open) throw new InvalidIncidentException('no open information request');
    const answered = InfoRequest.rehydrate(open.toSnapshot());
    answered.answer(answer, at);
    this.slaClock?.resume(at);
    const event = this.commit(next, by, at);
    this.infoRequests = this.infoRequests.map((request) => (request === open ? answered : request));
    this.pendingEvents.push(new InfoProvided(event, answered.toSnapshot().answer!));
  }

  resolve(summary: string, rootCause: string | undefined, by: Actor, at: Instant): void {
    const next = this.state.resolve(this);
    this.requireAssignee(by);
    const resolution = new Resolution(summary, rootCause, by.id, at);
    this.slaClock?.recordResolution(at);
    const event = this.commit(next, by, at);
    this.currentResolution = resolution;
    this.pendingEvents.push(new IncidentResolved(event, resolution.summary));
  }

  verify(by: Actor, at: Instant): void {
    const next = this.state.verify(this);
    this.requireReporter(by, 'INCIDENT_VERIFY_OWN');
    this.pendingEvents.push(new IncidentVerified(this.commit(next, by, at)));
  }

  reject(reason: string, by: Actor, at: Instant): void {
    const next = this.state.reject(this);
    this.requireReporter(by, 'INCIDENT_VERIFY_OWN');
    const validated = incidentText(reason, 'reason', 3, 1000);
    this.slaClock?.clearResolution(at);
    const event = this.commit(next, by, at);
    this.reopenCount += 1;
    this.pendingEvents.push(new IncidentReopened(event, validated, this.reopenCount));
  }

  close(by: Actor, at: Instant): void {
    const next = this.state.close(this);
    const closure = new ClosureInfo('RESOLVED', by.id, at);
    const event = this.commit(next, by, at);
    this.closure = closure;
    this.pendingEvents.push(new IncidentClosed(event, 'RESOLVED', null));
  }

  closeAsDuplicate(of: IncidentId, by: Actor, at: Instant): void {
    const next = this.state.closeAsDuplicate(this);
    if (of === this.id) throw new InvalidIncidentException('an incident cannot duplicate itself');
    const closure = new ClosureInfo('DUPLICATE', by.id, at, of);
    const event = this.commit(next, by, at);
    this.duplicateOfId = of;
    this.closure = closure;
    this.pendingEvents.push(new IncidentClosed(event, 'DUPLICATE', of));
  }

  giveFeedback(rating: Rating, comment: string | undefined, by: Actor, at: Instant): void {
    if (this.status() !== IncidentStatus.VERIFIED && this.status() !== IncidentStatus.CLOSED)
      throw new InvalidStateTransitionException(this.status(), 'giveFeedback');
    this.requireReporter(by, 'INCIDENT_FEEDBACK');
    if (this.feedback) throw new InvalidIncidentException('feedback may only be given once');
    const feedback = new Feedback(rating, comment, at);
    this.feedback = feedback;
    this.pendingEvents.push(new FeedbackGiven(this.context(by, at), rating));
  }

  pullEvents(): DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  /** Null before classification and for duplicates: a duplicate is tracked on its original. */
  slaStatus(now: Instant): SlaStatus | null {
    if (this.isClosedAsDuplicate()) return null;
    return this.slaClock?.overall(now) ?? null;
  }

  slaDeadlines(now: Instant): { response: Instant; resolution: Instant } | null {
    if (!this.slaClock || this.isClosedAsDuplicate()) return null;
    return {
      response: this.slaClock.responseDeadline(),
      resolution: this.slaClock.resolutionDeadline(now),
    };
  }

  private isClosedAsDuplicate(): boolean {
    return this.closure?.reason === 'DUPLICATE';
  }

  checkEscalation(
    chain: EscalationHandler,
    policy: EscalationPolicy,
    now: Instant,
  ): EscalationDecision | null {
    if (this.status() !== IncidentStatus.ASSIGNED || !this.currentPriority || !this.assignedAt)
      return null;
    const decision = chain.handle(
      new EscalationRequest(
        this.id,
        this.currentPriority,
        this.currentEscalationLevel,
        this.assignedAt.until(now),
      ),
      policy,
    );
    if (decision) {
      this.currentEscalationLevel = decision.to;
      this.pendingEvents.push(
        new IncidentEscalated(
          this.context(Actor.system(), now, null),
          decision.from,
          decision.to,
          decision.notifyRole,
          decision.reason,
        ),
      );
    }
    return decision;
  }

  checkSla(now: Instant): void {
    if (!this.slaClock || !this.isOpen()) return;
    const context = this.context(Actor.system(), now, null);
    for (const crossing of this.slaClock.check(now)) {
      const deadline =
        crossing.kind === SlaKind.RESPONSE
          ? this.slaClock.responseDeadline()
          : this.slaClock.resolutionDeadline(now);
      this.pendingEvents.push(
        crossing.what === 'WARNING'
          ? new SlaWarningRaised(context, crossing.kind, deadline)
          : new SlaBreached(context, crossing.kind, deadline),
      );
    }
  }

  toSnapshot(): IncidentSnapshot {
    const resolution = this.currentResolution;
    const feedback = this.feedback;
    const closure = this.closure;
    return {
      id: this.id,
      number: this.number.value,
      title: this.title,
      description: this.description,
      reporterId: this.reporter,
      serviceId: this.serviceId,
      categoryId: this.categoryId,
      impact: this.impact.value,
      urgency: this.urgency.value,
      affectedUsers: this.affectedUsers,
      priority: this.currentPriority?.value ?? null,
      status: this.status(),
      assigneeId: this.assignee,
      escalationLevel: this.currentEscalationLevel,
      assignedAt: this.assignedAt?.toIso() ?? null,
      duplicateOfId: this.duplicateOfId,
      createdAt: this.createdAt.toIso(),
      notes: this.investigationNotes.map((note) => ({
        authorId: note.authorId,
        text: note.text,
        at: note.at.toIso(),
      })),
      infoRequests: this.infoRequests.map((request) => request.toSnapshot()),
      resolution:
        resolution === null
          ? null
          : {
              summary: resolution.summary,
              resolvedBy: resolution.resolvedBy,
              at: resolution.at.toIso(),
              ...(resolution.rootCause === undefined ? {} : { rootCause: resolution.rootCause }),
            },
      feedback:
        feedback === null
          ? null
          : {
              rating: feedback.rating.value,
              at: feedback.at.toIso(),
              ...(feedback.comment === undefined ? {} : { comment: feedback.comment }),
            },
      closure:
        closure === null
          ? null
          : {
              reason: closure.reason,
              closedBy: closure.closedBy,
              at: closure.at.toIso(),
              ...(closure.duplicateOfId === undefined
                ? {}
                : { duplicateOfId: closure.duplicateOfId }),
            },
      reopenCount: this.reopenCount,
      slaClock: this.slaClock?.toSnapshot() ?? null,
    };
  }

  static rehydrate(s: IncidentSnapshot): Incident {
    const incident = new Incident({
      ...s,
      number: IncidentNumber.of(s.number),
      impact: Impact.of(s.impact),
      urgency: Urgency.of(s.urgency),
      at: Instant.fromIso(s.createdAt),
    });
    incident.state = IncidentStates.of(s.status);
    incident.categoryId = s.categoryId;
    incident.currentPriority = s.priority === null ? null : Priority.of(s.priority);
    incident.assignee = s.assigneeId;
    incident.currentEscalationLevel = s.escalationLevel;
    incident.assignedAt = s.assignedAt === null ? null : Instant.fromIso(s.assignedAt);
    incident.duplicateOfId = s.duplicateOfId;
    incident.investigationNotes = s.notes.map(
      (note) => new InvestigationNote(note.authorId, note.text, Instant.fromIso(note.at)),
    );
    incident.infoRequests = s.infoRequests.map((request) => InfoRequest.rehydrate(request));
    incident.currentResolution =
      s.resolution === null
        ? null
        : new Resolution(
            s.resolution.summary,
            s.resolution.rootCause,
            s.resolution.resolvedBy,
            Instant.fromIso(s.resolution.at),
          );
    incident.feedback =
      s.feedback === null
        ? null
        : new Feedback(
            Rating.of(s.feedback.rating),
            s.feedback.comment,
            Instant.fromIso(s.feedback.at),
          );
    incident.closure =
      s.closure === null
        ? null
        : new ClosureInfo(
            s.closure.reason,
            s.closure.closedBy,
            Instant.fromIso(s.closure.at),
            s.closure.duplicateOfId,
          );
    incident.reopenCount = s.reopenCount;
    incident.slaClock = s.slaClock === null ? null : SlaClock.rehydrate(s.slaClock);
    return incident;
  }

  private requireAssignee(by: Actor): void {
    if (this.assignee === null || !by.is(this.assignee))
      throw new UnauthorizedOperationException(by.role, 'INCIDENT_WORK');
  }
  private requireReporter(by: Actor, permission: string): void {
    if (!by.is(this.reporter)) throw new UnauthorizedOperationException(by.role, permission);
  }
  private context(
    by: Actor,
    at: Instant,
    from: IncidentStatus | null = this.status(),
  ): EventContext {
    return {
      incidentId: this.id,
      actorId: by.id,
      occurredAt: at,
      fromStatus: from,
      toStatus: this.status(),
    };
  }
  /** Called only after rule checks and composition construction have succeeded. */
  private commit(next: IncidentState, by: Actor, at: Instant): EventContext {
    const from = this.status();
    this.state = next;
    return this.context(by, at, from);
  }
}
