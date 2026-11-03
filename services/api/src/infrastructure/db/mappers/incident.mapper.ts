import type { IncidentSnapshot } from '../../../domain/incidents/index.js';
import {
  asCategoryId,
  asIncidentId,
  asItServiceId,
  asUserId,
} from '../../../domain/shared/index.js';
import { incidents, infoRequests, investigationNotes } from '../schema/index.js';

const date = (s: string | null | undefined): Date | null => (s == null ? null : new Date(s));
const iso = (d: Date | null): string | null => d?.toISOString() ?? null;
const user = (s: string | null) => (s === null ? null : asUserId(s));
export function incidentValues(s: IncidentSnapshot) {
  const c = s.slaClock;
  return {
    id: s.id,
    number: s.number,
    title: s.title,
    description: s.description,
    reporterId: s.reporterId,
    serviceId: s.serviceId,
    categoryId: s.categoryId,
    impact: s.impact,
    urgency: s.urgency,
    affectedUsers: s.affectedUsers,
    priority: s.priority,
    status: s.status,
    assigneeId: s.assigneeId,
    duplicateOfId: s.duplicateOfId,
    reopenCount: s.reopenCount,
    escalationLevel: s.escalationLevel,
    assignedAt: date(s.assignedAt),
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(),
    resolutionSummary: s.resolution?.summary ?? null,
    resolutionRootCause: s.resolution?.rootCause ?? null,
    resolutionResolvedBy: s.resolution?.resolvedBy ?? null,
    resolutionResolvedAt: date(s.resolution?.at),
    feedbackRating: s.feedback?.rating ?? null,
    feedbackComment: s.feedback?.comment ?? null,
    feedbackAt: date(s.feedback?.at),
    closureReason: s.closure?.reason ?? null,
    closureClosedBy: s.closure?.closedBy ?? null,
    closureAt: date(s.closure?.at),
    slaStartedAt: date(c?.startedAt),
    slaResponseMs: c?.target.response ?? null,
    slaResolutionMs: c?.target.resolution ?? null,
    slaWarningRatio: c ? String(c.warningRatio) : null,
    slaRespondedAt: date(c?.respondedAt),
    slaResolvedAt: date(c?.resolvedAt),
    slaPausedSince: date(c?.pausedSince),
    slaPausedTotalMs: c?.pausedTotal ?? null,
    slaWarned: c ? [...c.warned] : null,
    slaBreached: c ? [...c.breached] : null,
  };
}
export function incidentSnapshot(
  r: typeof incidents.$inferSelect,
  notes: (typeof investigationNotes.$inferSelect)[],
  requests: (typeof infoRequests.$inferSelect)[],
): IncidentSnapshot {
  return {
    id: asIncidentId(r.id),
    number: r.number,
    title: r.title,
    description: r.description,
    reporterId: asUserId(r.reporterId),
    serviceId: asItServiceId(r.serviceId),
    categoryId: r.categoryId === null ? null : asCategoryId(r.categoryId),
    impact: r.impact,
    urgency: r.urgency,
    affectedUsers: r.affectedUsers,
    priority: r.priority,
    status: r.status,
    assigneeId: user(r.assigneeId),
    duplicateOfId: r.duplicateOfId === null ? null : asIncidentId(r.duplicateOfId),
    reopenCount: r.reopenCount,
    escalationLevel: r.escalationLevel,
    assignedAt: iso(r.assignedAt),
    createdAt: r.createdAt.toISOString(),
    notes: notes.map((n) => ({ authorId: user(n.authorId), text: n.text, at: n.at.toISOString() })),
    infoRequests: requests.map((q) => ({
      question: q.question,
      askedBy: user(q.askedBy),
      askedAt: q.askedAt.toISOString(),
      ...(q.answer === null ? {} : { answer: q.answer }),
      ...(q.answeredAt === null ? {} : { answeredAt: q.answeredAt.toISOString() }),
    })),
    resolution:
      r.resolutionSummary === null
        ? null
        : {
            summary: r.resolutionSummary,
            ...(r.resolutionRootCause === null ? {} : { rootCause: r.resolutionRootCause }),
            resolvedBy: user(r.resolutionResolvedBy),
            at: r.resolutionResolvedAt!.toISOString(),
          },
    feedback:
      r.feedbackRating === null
        ? null
        : {
            rating: r.feedbackRating,
            ...(r.feedbackComment === null ? {} : { comment: r.feedbackComment }),
            at: r.feedbackAt!.toISOString(),
          },
    closure:
      r.closureReason === null
        ? null
        : {
            reason: r.closureReason,
            closedBy: user(r.closureClosedBy),
            at: r.closureAt!.toISOString(),
            ...(r.closureReason === 'DUPLICATE' && r.duplicateOfId !== null
              ? { duplicateOfId: asIncidentId(r.duplicateOfId) }
              : {}),
          },
    slaClock:
      r.slaStartedAt === null
        ? null
        : {
            startedAt: r.slaStartedAt.toISOString(),
            target: { response: r.slaResponseMs!, resolution: r.slaResolutionMs! },
            warningRatio: Number(r.slaWarningRatio),
            respondedAt: iso(r.slaRespondedAt),
            resolvedAt: iso(r.slaResolvedAt),
            pausedSince: iso(r.slaPausedSince),
            pausedTotal: r.slaPausedTotalMs!,
            warned: r.slaWarned ?? [],
            breached: r.slaBreached ?? [],
          },
  };
}
