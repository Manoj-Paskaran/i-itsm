import type { IncidentDetail } from '@itsm/contracts';
import { lifecycleTrack } from './incidents';

type Status = IncidentDetail['status'];
/** The fields of an audit entry the roadmap reads. */
export type AuditEntry = {
  at: string;
  action?: string;
  fromStatus: Status | null;
  toStatus: Status | null;
};
export type Tone = 'muted' | 'success' | 'warning' | 'critical';
export interface SlaNote {
  label: 'Response' | 'Resolution';
  deadline: Date;
  text: string;
  tone: Tone;
}
export interface RoadmapStep {
  label: string;
  state: 'reached' | 'active' | 'upcoming';
  reachedAt: Date | null;
  phase: { text: string; tone: 'primary' | 'warning' } | null;
  sla: SlaNote | null;
  /** Extra fact under a reached step, e.g. which incident this one duplicates. */
  note: string | null;
  /** When `note` references another incident, link straight to it. */
  noteLink?: { incidentId: string; number: string } | null;
}

// The audit status each lifecycle step stands for; Reported uses createdAt instead.
const STEP_STATUS: Record<string, Status> = {
  Assigned: 'ASSIGNED',
  Acknowledged: 'ACKNOWLEDGED',
  'In progress': 'IN_PROGRESS',
  Resolved: 'RESOLVED',
  Verified: 'VERIFIED',
  Closed: 'CLOSED',
};

const firstName = (name: string | undefined) => name?.split(' ')[0] ?? '';

export function formatDuration(ms: number) {
  const minutes = Math.floor(Math.abs(ms) / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function formatClock(at: Date, now: Date) {
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return at.toDateString() === now.toDateString()
    ? time
    : `${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace(' ', '\u00a0')},\u00a0${time}`;
}

/** When the incident last entered `status`, from the audit trail. */
export function reachedAt(audit: AuditEntry[], status: Status, which: 'first' | 'last' = 'last') {
  // Answering an info request returns to In progress, but work started earlier; keep that time.
  const hits = audit.filter(
    (entry) =>
      entry.toStatus === status &&
      // A reassignment stays ASSIGNED → ASSIGNED; it still re-times the Assigned step.
      (entry.fromStatus !== status || entry.action === 'IncidentAssigned') &&
      !(status === 'IN_PROGRESS' && entry.fromStatus === 'PENDING_INFO'),
  );
  const hit = which === 'first' ? hits[0] : hits[hits.length - 1];
  return hit ? new Date(hit.at) : null;
}

/** The step after the last reached one is the phase in progress; this is its wording. */
export function phaseLine(detail: IncidentDetail, viewerId?: string): RoadmapStep['phase'] {
  const isAssignee = viewerId !== undefined && viewerId === detail.assignee?.id;
  const assignee = firstName(detail.assignee?.name);
  // The reporter reads their own incident: the wait is on them, so say so.
  const self = viewerId !== undefined && viewerId === detail.reporter.id;
  const reporter = self ? 'you' : firstName(detail.reporter.name);
  switch (detail.status) {
    case 'NEW':
      return { text: 'Classifying', tone: 'primary' };
    case 'CLASSIFIED':
      return { text: 'Assigning', tone: 'primary' };
    case 'ASSIGNED':
      return {
        text: isAssignee
          ? 'Acknowledging · your turn'
          : `Acknowledging · waiting for\u00a0${assignee}`,
        tone: 'primary',
      };
    case 'ACKNOWLEDGED':
      return {
        text: isAssignee
          ? 'Starting work · your turn'
          : `Starting work · waiting for\u00a0${assignee}`,
        tone: 'primary',
      };
    case 'IN_PROGRESS':
      return {
        text: isAssignee ? 'Resolving · your turn' : `Resolving · with\u00a0${assignee}`,
        tone: 'primary',
      };
    case 'PENDING_INFO':
      return {
        text: self ? 'Waiting for your answer' : `Waiting for info from\u00a0${reporter}`,
        tone: 'warning',
      };
    case 'REOPENED':
      return {
        text: isAssignee ? 'Reopened · your turn' : `Reopened · waiting for\u00a0${assignee}`,
        tone: 'warning',
      };
    case 'RESOLVED':
      return { text: `Confirming fix · waiting for\u00a0${reporter}`, tone: 'primary' };
    case 'VERIFIED':
      return { text: 'Closing', tone: 'primary' };
    case 'CLOSED':
      return null;
  }
}

function slaNote(
  label: SlaNote['label'],
  deadline: Date,
  doneAt: Date | null,
  reached: boolean,
  paused: boolean,
  atRisk: boolean,
  now: Date,
): SlaNote | null {
  if (reached) {
    if (!doneAt) return null;
    const late = doneAt.getTime() - deadline.getTime();
    if (late > 0)
      return {
        label,
        deadline,
        text: `${label} late by ${formatDuration(late)}`,
        tone: 'critical',
      };
    const early = -late;
    return {
      label,
      deadline,
      text: early > 0 ? `${label} met · ${formatDuration(early)} early` : `${label} met`,
      tone: 'success',
    };
  }
  const due = `${label} due ${formatClock(deadline, now)}`;
  const left = deadline.getTime() - now.getTime();
  // A pause stops the clock but doesn't undo a breach that already happened.
  if (paused)
    return left < 0
      ? {
          label,
          deadline,
          text: `${due} · ${formatDuration(left)} overdue · paused`,
          tone: 'critical',
        }
      : {
          label,
          deadline,
          text: `Clock paused · ${formatDuration(left)} left when resumed`,
          tone: 'muted',
        };
  if (left < 0)
    return { label, deadline, text: `${due} · ${formatDuration(left)} overdue`, tone: 'critical' };
  return {
    label,
    deadline,
    text: `${due} · in ${formatDuration(left)}`,
    // Amber exactly when the API says at risk (its policy warning ratio), so rail and header agree.
    tone: atRisk ? 'warning' : 'muted',
  };
}

/** Builds the lifecycle roadmap: reached steps with their times, the active phase, and SLA notes. */
export function roadmap(
  detail: IncidentDetail,
  audit: AuditEntry[],
  now: Date,
  viewerId?: string,
): RoadmapStep[] {
  const { steps } = lifecycleTrack(detail);
  // A reopened incident has to start work again, so it has only reached Acknowledged.
  const current = detail.status === 'REOPENED' ? 2 : lifecycleTrack(detail).current;
  const duplicate = detail.closure?.reason === 'DUPLICATE';
  const paused = detail.status === 'PENDING_INFO' || detail.slaStatus === 'PAUSED';
  return steps.map((label, i) => {
    const state = i <= current ? 'reached' : i === current + 1 ? 'active' : 'upcoming';
    const status = STEP_STATUS[label];
    const at =
      state !== 'reached'
        ? null
        : label === 'Reported'
          ? new Date(detail.createdAt)
          : status
            ? reachedAt(audit, status)
            : null;
    let sla: SlaNote | null = null;
    if (detail.slaDeadlines && !duplicate) {
      // The response target is met by the first acknowledge, even if a reassign sends it back.
      const acknowledged = reachedAt(audit, 'ACKNOWLEDGED', 'first');
      if (label === 'Acknowledged')
        sla = slaNote(
          'Response',
          new Date(detail.slaDeadlines.response),
          acknowledged,
          state === 'reached' || acknowledged !== null,
          false,
          detail.slaStatus === 'AT_RISK',
          now,
        );
      if (label === 'Resolved')
        sla = slaNote(
          'Resolution',
          new Date(detail.slaDeadlines.resolution),
          reachedAt(audit, 'RESOLVED'),
          state === 'reached',
          paused,
          // While the response target is open it is the one the at-risk status refers to.
          detail.slaStatus === 'AT_RISK' && acknowledged !== null,
          now,
        );
    }
    return {
      label,
      state,
      reachedAt: at,
      phase: state === 'active' ? phaseLine(detail, viewerId) : null,
      sla,
      note:
        duplicate && label === 'Closed' && detail.closure?.duplicateOf
          ? `Duplicate of ${detail.closure.duplicateOf.number}`
          : null,
      noteLink:
        duplicate && label === 'Closed' && detail.closure?.duplicateOf
          ? {
              incidentId: detail.closure.duplicateOf.id,
              number: detail.closure.duplicateOf.number,
            }
          : null,
    };
  });
}
