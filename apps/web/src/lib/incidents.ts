import {
  AuditEntrySchema,
  IncidentDetailSchema,
  IncidentSummarySchema,
  RecommendationSchema,
  CategorySummarySchema,
  ServiceSummarySchema,
  TechnicianSummarySchema,
  type CreateIncidentRequest,
  type IncidentDetail,
} from '@itsm/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from './auth';
type Action = IncidentDetail['allowedActions'][number];
type Mutation =
  | { action: 'acknowledge' | 'startWork' | 'verify' | 'close' }
  | { action: 'addNote'; text: string }
  | { action: 'requestInfo'; question: string }
  | { action: 'resolve'; summary: string; rootCause?: string }
  | { action: 'reject'; reason: string }
  | { action: 'provideInfo'; answer: string }
  | { action: 'giveFeedback'; rating: number; comment?: string }
  | { action: 'assign'; technicianId?: string }
  | { action: 'closeAsDuplicate'; duplicateOfId: string };
// Realtime incident.updated only reaches view-all staff, so other roles poll while a view is open.
function useLiveInterval() {
  const { user } = useAuth();
  return user?.permissions.includes('INCIDENT_VIEW_ALL') ? false : 5000;
}
export function useIncident(id: string) {
  const refetchInterval = useLiveInterval();
  return useQuery({
    refetchInterval,
    queryKey: ['incident', id],
    queryFn: () => apiFetch(`/api/incidents/${id}`, IncidentDetailSchema),
  });
}
export function useIncidentAudit(id: string) {
  const refetchInterval = useLiveInterval();
  return useQuery({
    refetchInterval,
    queryKey: ['incident-audit', id],
    queryFn: () => apiFetch(`/api/incidents/${id}/audit`, AuditEntrySchema.array()),
  });
}
export function useIncidents(search = 'limit=200') {
  const refetchInterval = useLiveInterval();
  return useQuery({
    refetchInterval,
    queryKey: ['incidents', search],
    queryFn: () => apiFetch(`/api/incidents?${search}`, IncidentSummarySchema.array()),
    placeholderData: (previous) => previous,
  });
}
export function useIncidentAction(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ action, ...body }: Mutation) =>
      apiFetch(
        `/api/incidents/${id}/${{ acknowledge: 'acknowledge', startWork: 'start', addNote: 'notes', requestInfo: 'request-info', resolve: 'resolve', verify: 'verify', close: 'close', reject: 'reject', provideInfo: 'provide-info', giveFeedback: 'feedback', assign: 'assign', closeAsDuplicate: 'close-as-duplicate' }[action]}`,
        IncidentDetailSchema,
        { method: 'POST', ...(Object.keys(body).length ? { body: JSON.stringify(body) } : {}) },
      ),
    // Stay pending until the audit has refetched, so the roadmap never shows a reached step without its time.
    onSuccess: async (data) => {
      void client.invalidateQueries({ queryKey: ['incidents'] });
      await client.invalidateQueries({ queryKey: ['incident-audit', id] });
      client.setQueryData(['incident', id], data);
    },
  });
}
export const LIFECYCLE_STEPS = [
  'Reported',
  'Assigned',
  'Acknowledged',
  'In progress',
  'Resolved',
  'Verified',
  'Closed',
];
export const STATUS_LABEL: Record<IncidentDetail['status'], string> = {
  NEW: 'New',
  CLASSIFIED: 'Classified',
  ASSIGNED: 'Assigned',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In progress',
  PENDING_INFO: 'Waiting for info',
  RESOLVED: 'Resolved',
  VERIFIED: 'Verified',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};
/** Pill colour family: active work (cobalt), waiting on someone (amber), done (slate). */
export function statusGroup(status: IncidentDetail['status']) {
  if (['PENDING_INFO', 'RESOLVED'].includes(status)) return 'waiting' as const;
  if (['VERIFIED', 'CLOSED'].includes(status)) return 'done' as const;
  return 'active' as const;
}
export const PRIORITY_LABEL = { P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' };
export const LEVEL_LABEL: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Critical',
};
export const CRITICALITY_LABEL: Record<number, string> = { ...LEVEL_LABEL, 4: 'Mission-critical' };
export const ESCALATION_LABEL = {
  TECHNICIAN: 'Technician',
  TEAM_LEAD: 'Team lead',
  SYS_ADMIN: 'System admin',
  IT_MANAGER: 'IT manager',
};
export const ACTION_LABELS = {
  acknowledge: 'Acknowledge',
  startWork: 'Start work',
  resolve: 'Resolve',
  verify: 'Confirm fix',
  close: 'Close incident',
  provideInfo: 'Answer question',
  requestInfo: 'Request info',
  reject: 'Not fixed, reopen',
};
export function lifecycleStep(status: IncidentDetail['status']) {
  return {
    NEW: 0,
    CLASSIFIED: 0,
    ASSIGNED: 1,
    ACKNOWLEDGED: 2,
    IN_PROGRESS: 3,
    PENDING_INFO: 3,
    REOPENED: 3,
    RESOLVED: 4,
    VERIFIED: 5,
    CLOSED: 6,
  }[status];
}
export function primaryAction(allowed: Action[]) {
  return (
    (['acknowledge', 'startWork', 'resolve', 'verify', 'close', 'provideInfo'] as const).find((a) =>
      allowed.includes(a),
    ) ?? null
  );
}
export function secondaryActions(allowed: Action[]) {
  return (['requestInfo', 'reject'] as const).filter((a) => allowed.includes(a));
}
const AUDIT_LEVELS: Record<string, string> = {
  'Team Lead': ESCALATION_LABEL.TEAM_LEAD,
  'System Administrator': ESCALATION_LABEL.SYS_ADMIN,
  'IT Manager': ESCALATION_LABEL.IT_MANAGER,
};
export function humanizeAudit(description: string, number: string) {
  const text = description
    .replace(new RegExp(`^Incident ${number} `), '')
    .replace(new RegExp(` (?:on |to |for )?incident ${number}`, 'gi'), '')
    .replace(/ \((?:EMPLOYEE|TECHNICIAN|TEAM_LEAD|ADMIN|IT_MANAGER)\)/g, '')
    .replace(
      /→ (Team Lead|System Administrator|IT Manager)/g,
      (_, level: string) => `→ ${AUDIT_LEVELS[level]}`,
    )
    .replace(
      /\b(RESPONSE|RESOLUTION) SLA\b/g,
      (_, target: string) => `${target[0]}${target.slice(1).toLowerCase()} SLA`,
    )
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, (iso) =>
      new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    );
  return text.charAt(0).toUpperCase() + text.slice(1);
}
export function waitingCopy(detail: IncidentDetail, viewerId?: string) {
  const reporter = detail.reporter.name;
  if (detail.allowedActions.some((a) => a === 'assign' || a === 'closeAsDuplicate'))
    return 'Reassign or close it as a duplicate from the side panel.';
  if (viewerId === detail.reporter.id && detail.allowedActions.includes('giveFeedback'))
    return 'Closed. Tell us how we did below.';
  if (viewerId === detail.reporter.id && detail.status !== 'CLOSED')
    return "Nothing needed from you right now. We'll notify you when something changes.";
  if (detail.status === 'PENDING_INFO') return `Waiting for ${reporter} to answer.`;
  if (detail.status === 'RESOLVED') return `Waiting for ${reporter} to confirm the fix.`;
  if (detail.status === 'CLOSED') return 'Closed. No further actions.';
  return 'No actions available to you in this state.';
}
export function lifecycleTrack(detail: IncidentDetail) {
  // A duplicate closes straight from triage; show only the steps it really passed.
  if (detail.closure?.reason === 'DUPLICATE') return { steps: ['Reported', 'Closed'], current: 1 };
  return { steps: LIFECYCLE_STEPS, current: lifecycleStep(detail.status) };
}
export function formatRationale(line: string) {
  return line
    .replace(/\b\d{4,}\b/g, (n) => Number(n).toLocaleString('en-IN'))
    .replace(/ × (?=[A-Z])/g, '\n× ');
}
export function formatAssignmentReason(reason: string) {
  return reason
    .split(' · ')
    .filter((part) => !/^resolved 0 incidents/.test(part))
    .join(' · ');
}
/** Fill colour of an activity icon: cobalt for ownership, green for fixes, red for breaches, amber for waits. */
export function activityTone(action: string) {
  if (['IncidentAssigned', 'IncidentAcknowledged'].includes(action)) return 'active' as const;
  if (['IncidentResolved', 'IncidentVerified'].includes(action)) return 'success' as const;
  if (['SlaBreached', 'IncidentEscalated'].includes(action)) return 'critical' as const;
  if (['SlaWarningRaised', 'InfoRequested'].includes(action)) return 'waiting' as const;
  return 'neutral' as const;
}
type AuditItem = { at: string; action: string };
type NoteItem = { at: string };
/** Audit entries and notes as one timeline; NoteAdded audit rows are dropped because the note itself shows. */
export function activityEvents<A extends AuditItem, N extends NoteItem>(
  audit: A[],
  notes: N[],
  order: 'newest' | 'oldest',
) {
  const events = [
    ...audit
      .filter((entry) => entry.action !== 'NoteAdded')
      .map((entry) => ({ kind: 'audit' as const, at: entry.at, entry })),
    ...notes.map((entry) => ({ kind: 'note' as const, at: entry.at, entry })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return order === 'newest' ? events.reverse() : events;
}
export function useTechnicians(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['technicians'],
    queryFn: () => apiFetch('/api/technicians', TechnicianSummarySchema.array()),
    staleTime: 60000,
  });
}
export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: () => apiFetch('/api/services', ServiceSummarySchema.array()),
    staleTime: 300000,
  });
}
export function useReportIncident() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateIncidentRequest) =>
      apiFetch('/api/incidents', IncidentDetailSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      client.setQueryData(['incident', data.id], data);
      void client.invalidateQueries({ queryKey: ['incidents'] });
    },
  });
}
export function useRecommendations(id: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['recommendations', id],
    queryFn: () => apiFetch(`/api/incidents/${id}/recommendations`, RecommendationSchema.array()),
  });
}
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch('/api/categories', CategorySummarySchema.array()),
    staleTime: 300000,
  });
}
