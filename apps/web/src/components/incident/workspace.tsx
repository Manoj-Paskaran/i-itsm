import type { IncidentDetail } from '@itsm/contracts';
import { Link } from '@tanstack/react-router';
import {
  AlarmClock,
  AlarmClockOff,
  Archive,
  ArrowUpRight,
  BadgeCheck,
  Circle,
  CircleCheck,
  CircleDot,
  CirclePlus,
  Clock,
  Eye,
  Hourglass,
  MessageCircleQuestion,
  PanelRight,
  Play,
  Reply,
  RotateCcw,
  Server,
  Signal,
  Star,
  StickyNote,
  Tag,
  UserCheck,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { ApiError } from '@/lib/api';
import {
  ACTION_LABELS,
  activityEvents,
  activityTone,
  ESCALATION_LABEL,
  humanizeAudit,
  waitingCopy,
  LEVEL_LABEL,
  primaryAction,
  secondaryActions,
  useIncident,
  useIncidentAction,
  useIncidentAudit,
} from '@/lib/incidents';
import { useAuth } from '@/lib/auth';
import { homeLabel } from '@/lib/report';
import { formatClock } from '@/lib/roadmap';
import { useNow } from '@/lib/use-now';
import { chip, PriorityChip, SlaPill, StatusPill } from './chips';
import { ContextPanel, formatDate } from './context-panel';
import { ClusterBanner } from './insights-panel';
import { useWorkspaceInsights } from '@/lib/insights';
import { LifecycleRail } from './lifecycle-rail';

type FormAction = 'requestInfo' | 'resolve' | 'reject' | 'provideInfo';
const icons = {
  acknowledge: Eye,
  startWork: Play,
  resolve: CircleCheck,
  verify: BadgeCheck,
  close: Archive,
  provideInfo: Reply,
  requestInfo: MessageCircleQuestion,
  reject: RotateCcw,
};
const auditIcons: Record<string, typeof Circle> = {
  IncidentCreated: CirclePlus,
  IncidentClassified: Tag,
  PriorityChanged: Signal,
  IncidentAssigned: UserCheck,
  IncidentAcknowledged: Eye,
  WorkStarted: Play,
  InfoRequested: MessageCircleQuestion,
  InfoProvided: Reply,
  IncidentResolved: CircleCheck,
  IncidentVerified: BadgeCheck,
  IncidentReopened: RotateCcw,
  IncidentClosed: Archive,
  FeedbackGiven: Star,
  SlaBreached: AlarmClockOff,
  SlaWarningRaised: AlarmClock,
  IncidentEscalated: ArrowUpRight,
};
const button =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3.5 text-base disabled:opacity-50 max-sm:min-h-10';
const primary = 'bg-primary font-semibold text-primary-foreground hover:bg-primary-hover';
const secondaryButton = 'border border-border bg-background font-medium hover:bg-hover';

type LiveEvent =
  | { kind: 'note'; key: string; at: string; authorId: string; authorName: string }
  | {
      kind: 'audit';
      key: string;
      at: string;
      action: string;
      actorId: string | null;
      actorName: string | null;
      description: string;
    };

export function liveEventKey(
  event:
    { kind: 'note'; at: string; authorId: string } | { kind: 'audit'; at: string; action: string },
) {
  return event.kind === 'note'
    ? `n|${event.at}|${event.authorId}`
    : `a|${event.at}|${event.action}`;
}

export function liveUpdateMessage(
  event: LiveEvent,
  detail: IncidentDetail,
  viewerId?: string,
): string {
  const firstName = (name: string | null | undefined) => name?.split(' ')[0] ?? '';
  if (event.kind === 'note') return `${firstName(event.authorName)} added a note`;
  const actor = firstName(event.actorName);
  switch (event.action) {
    case 'InfoProvided':
      return actor
        ? viewerId && viewerId === detail.assignee?.id
          ? `${actor} answered your question`
          : `${actor} answered the question`
        : 'Information provided';
    case 'InfoRequested':
      return actor ? `${actor} asked for information` : 'Information requested';
    case 'IncidentResolved':
      return actor ? `${actor} resolved this incident` : 'Incident resolved';
    case 'IncidentVerified':
      return actor ? `${actor} confirmed the fix` : 'Fix confirmed';
    case 'IncidentReopened':
      return actor ? `${actor} reopened this incident` : 'Incident reopened';
    case 'IncidentClosed':
      return actor ? `${actor} closed this incident` : 'Incident closed';
    case 'IncidentAcknowledged':
      return actor ? `${actor} acknowledged this incident` : 'Incident acknowledged';
    case 'WorkStarted':
      return actor ? `${actor} started work` : 'Work started';
    case 'FeedbackGiven':
      return actor ? `${actor} sent feedback` : 'Feedback received';
    case 'SlaWarningRaised':
      return 'SLA is now at risk';
    case 'SlaBreached':
      return 'SLA deadline breached';
    case 'IncidentEscalated':
      return 'Incident escalated';
    default:
      return humanizeAudit(event.description, detail.number, event.actorName ?? undefined);
  }
}
export function IncidentWorkspace({ incidentId }: { incidentId: string }) {
  const query = useIncident(incidentId);
  if (query.isLoading)
    return (
      <div className="space-y-5 p-8">
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="h-7 w-3/5 animate-pulse rounded bg-muted" />
        <div className="h-6 w-60 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-[1fr_320px] gap-8 pt-10 max-lg:grid-cols-1">
          <div className="h-80 animate-pulse rounded bg-muted" />
          <div className="h-80 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  if (query.isError || !query.data) {
    const missing = query.error instanceof ApiError && [403, 404].includes(query.error.status);
    return (
      <div className="grid min-h-[60vh] place-content-center gap-2 text-center">
        <h1 className="text-lg font-semibold">
          {missing ? 'Incident not found' : 'Could not load incident'}
        </h1>
        <p className="text-muted-foreground">
          {missing
            ? 'It may not exist, or it is not assigned to you.'
            : query.error instanceof Error
              ? query.error.message
              : 'Please try again.'}
        </p>
        {missing ? (
          <Link to="/" className="text-primary">
            Back to the list
          </Link>
        ) : (
          <button className="text-primary" onClick={() => void query.refetch()}>
            Try again
          </button>
        )}
      </div>
    );
  }
  return <Workspace key={query.data.id} detail={query.data} />;
}
function Workspace({ detail }: { detail: IncidentDetail }) {
  const mutation = useIncidentAction(detail.id);
  const audit = useIncidentAudit(detail.id);
  const insights = useWorkspaceInsights(detail);
  const { user } = useAuth();
  const [form, setForm] = useState<FormAction | null>(null);
  const [focusFeedback, setFocusFeedback] = useState(false);
  const [liveCue, setLiveCue] = useState<{
    key: string;
    message: string;
    highlighted: boolean;
  } | null>(null);
  const seenEventsRef = useRef<Set<string> | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (!audit.data) return;
    const current: LiveEvent[] = [
      ...audit.data
        .filter((entry) => entry.action !== 'NoteAdded')
        .map((entry) => ({
          kind: 'audit' as const,
          key: liveEventKey({ kind: 'audit', at: entry.at, action: entry.action }),
          at: entry.at,
          action: entry.action,
          actorId: entry.actor?.id ?? null,
          actorName: entry.actor?.name ?? null,
          description: entry.description,
        })),
      ...detail.notes.map((entry) => ({
        kind: 'note' as const,
        key: liveEventKey({ kind: 'note', at: entry.at, authorId: entry.author.id }),
        at: entry.at,
        authorId: entry.author.id,
        authorName: entry.author.name,
      })),
    ];
    if (!seenEventsRef.current) {
      seenEventsRef.current = new Set(current.map((event) => event.key));
      return;
    }
    const added = current.filter((event) => !seenEventsRef.current!.has(event.key));
    for (const event of added) seenEventsRef.current.add(event.key);
    const external = added
      .filter((event) =>
        event.kind === 'note' ? event.authorId !== user?.id : event.actorId !== user?.id,
      )
      .sort((a, b) => a.at.localeCompare(b.at));
    const latest = external.at(-1);
    if (!latest) return;
    const message = liveUpdateMessage(latest, detail, user?.id);
    queueMicrotask(() => {
      if (mountedRef.current) setLiveCue({ key: latest.key, message, highlighted: true });
    });
  }, [audit.data, detail, user?.id]);
  const liveCueKey = liveCue?.key ?? null;
  useEffect(() => {
    if (!liveCueKey) return;
    const unhighlightTimer = setTimeout(() => {
      setLiveCue((prev) => (prev?.key === liveCueKey ? { ...prev, highlighted: false } : prev));
    }, 2000);
    const hideTimer = setTimeout(() => {
      setLiveCue((prev) => (prev?.key === liveCueKey ? null : prev));
    }, 4500);
    return () => {
      clearTimeout(unhighlightTimer);
      clearTimeout(hideTimer);
    };
  }, [liveCueKey]);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [form]);
  const clearFocusFeedback = useCallback(() => setFocusFeedback(false), []);
  const [text, setText] = useState('');
  const [rootCause, setRootCause] = useState('');
  const mainAction = primaryAction(detail.allowedActions);
  const secondary = secondaryActions(detail.allowedActions);
  const isDuplicate = detail.closure?.reason === 'DUPLICATE';
  const feedbackPending =
    detail.status === 'VERIFIED' &&
    !detail.feedback &&
    detail.allowedActions.includes('giveFeedback');
  const sidePanelAction = detail.allowedActions.some(
    (action) => action === 'assign' || action === 'closeAsDuplicate',
  );
  const WaitingIcon = sidePanelAction
    ? PanelRight
    : detail.status === 'CLOSED'
      ? CircleCheck
      : Hourglass;
  function choose(action: keyof typeof ACTION_LABELS) {
    mutation.reset();
    if (['requestInfo', 'resolve', 'reject', 'provideInfo'].includes(action)) {
      setText('');
      setRootCause('');
      setForm(form === action ? null : (action as FormAction));
    } else
      mutation.mutate(
        { action: action as 'acknowledge' | 'startWork' | 'verify' | 'close' },
        action === 'verify' ? { onSuccess: () => setFocusFeedback(true) } : undefined,
      );
  }
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!form || !text.trim() || mutation.isPending) return;
    const value = text.trim();
    const action =
      form === 'requestInfo'
        ? ({ action: form, question: value } as const)
        : form === 'resolve'
          ? ({
              action: form,
              summary: value,
              ...(rootCause.trim() ? { rootCause: rootCause.trim() } : {}),
            } as const)
          : form === 'reject'
            ? ({ action: form, reason: value } as const)
            : ({ action: form, answer: value } as const);
    mutation.mutate(action, {
      onSuccess: () => {
        setForm(null);
        setText('');
      },
    });
  }
  function keys(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') setForm(null);
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }
  return (
    <>
      <header className="border-b border-border bg-background px-8 pt-5 pb-5 max-sm:px-4">
        <div className="flex gap-2 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            {homeLabel(user)}
          </Link>
          <span aria-hidden>/</span>
          <span className="tabular">{detail.number}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <h1 className="max-w-[60ch] text-balance text-2xl font-semibold tracking-[-0.015em]">
            {detail.title}
          </h1>
          <div className="flex max-w-full flex-wrap gap-2">
            {[...secondary, ...(mainAction ? [mainAction] : [])].map((action) => {
              const Icon = icons[action];
              const isPrimary = action === mainAction && !(action === 'close' && feedbackPending);
              return (
                <button
                  key={action}
                  disabled={mutation.isPending}
                  onClick={() => choose(action)}
                  className={`${button} ${isPrimary ? primary : secondaryButton}`}
                >
                  <Icon size={15} strokeWidth={2} aria-hidden />
                  {mutation.isPending && mutation.variables?.action === action
                    ? `${ACTION_LABELS[action]}…`
                    : ACTION_LABELS[action]}
                </button>
              );
            })}
            {!mainAction &&
              !secondary.length &&
              (user?.id === detail.reporter.id ? (
                <p className="flex min-h-9 items-center text-sm leading-snug text-muted-foreground">
                  {waitingCopy(detail, user?.id)}
                </p>
              ) : (
                <span className="inline-flex min-h-9 max-w-full items-center gap-1.5 text-sm text-muted-foreground lg:max-w-[22rem]">
                  <WaitingIcon size={14} className="shrink-0" aria-hidden />
                  <span className="min-w-0">{waitingCopy(detail, user?.id)}</span>
                </span>
              ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill status={detail.status} duplicate={isDuplicate} />
          <PriorityChip priority={detail.priority} />
          {!isDuplicate && detail.slaStatus && <SlaPill status={detail.slaStatus} />}
          {!isDuplicate && detail.escalationLevel !== 'TECHNICIAN' && (
            <span className={`${chip} border-transparent bg-high-subtle text-high-foreground`}>
              <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
              Escalated to {ESCALATION_LABEL[detail.escalationLevel]}
            </span>
          )}
          <span className={`${chip} text-muted-foreground`}>
            <Server size={13} aria-hidden />
            {detail.service.name}
          </span>
          {detail.category && (
            <span className={`${chip} text-muted-foreground`}>
              <Tag size={13} aria-hidden />
              {detail.category.name}
            </span>
          )}
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <LifecycleRail detail={detail} audit={audit.data ?? []} />
        </div>
        {mutation.isError && (
          <p role="alert" className="pt-3 text-xs text-critical-foreground">
            {mutation.error.message}
          </p>
        )}
        {form && (
          <form
            ref={formRef}
            onSubmit={submit}
            className="mt-4 max-w-[640px] space-y-3 rounded-lg border border-border bg-panel p-4"
          >
            <h2 className="text-sm font-semibold">
              {
                {
                  requestInfo: 'Ask the reporter for information',
                  resolve: `Resolve ${detail.number}`,
                  reject: 'Why is this not fixed?',
                  provideInfo: 'Answer the technician',
                }[form]
              }
            </h2>
            {form === 'provideInfo' && (
              <blockquote className="text-sm text-muted-foreground">
                {[...detail.infoRequests].reverse().find((item) => item.answer === null)?.question}
              </blockquote>
            )}
            <label className="block text-xs font-medium">
              {
                {
                  requestInfo: 'Question',
                  resolve: 'Resolution summary',
                  reject: 'Reason',
                  provideInfo: 'Answer',
                }[form]
              }
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={keys}
                placeholder={form === 'requestInfo' ? 'What do you need to know?' : undefined}
                className="mt-1 block min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            {form === 'resolve' && (
              <label className="block text-xs font-medium">
                Root cause <span className="text-muted-foreground">(optional)</span>
                <textarea
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  onKeyDown={keys}
                  className="mt-1 block min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={button} onClick={() => setForm(null)}>
                Cancel
              </button>
              <button
                className={`${button} ${primary}`}
                disabled={!text.trim() || mutation.isPending}
              >
                {form === 'requestInfo' ? 'Send request' : ACTION_LABELS[form]}
              </button>
            </div>
          </form>
        )}
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] max-lg:grid-cols-1">
        <div className="min-w-0 space-y-8 px-8 py-6 max-sm:px-4">
          {insights && <ClusterBanner insights={insights} currentId={detail.id} />}
          <section aria-labelledby="summary">
            <h2 id="summary" className="mb-2 text-sm font-semibold">
              Summary
            </h2>
            <p className="max-w-[70ch] whitespace-pre-wrap text-body">{detail.description}</p>
            <div className="mt-4 flex flex-wrap gap-8">
              {[
                ['Impact', LEVEL_LABEL[detail.impact]],
                ['Urgency', LEVEL_LABEL[detail.urgency]],
                ['Affected users', detail.affectedUsers.toLocaleString('en-IN')],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-base font-medium tabular">{value}</div>
                </div>
              ))}
            </div>
          </section>
          {!!detail.infoRequests.length && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Requests for information</h2>
              <div className="space-y-3">
                {detail.infoRequests.map((item, i) => (
                  <div key={i} className="divide-y divide-border rounded-lg border border-border">
                    <div className="p-3">
                      <p>{item.question}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Asked by {item.askedBy.name} · {formatDate(item.askedAt)}
                      </p>
                    </div>
                    <div className="p-3">
                      {item.answer ? (
                        <>
                          <p className="text-xs text-muted-foreground">Answer</p>
                          <p>{item.answer}</p>
                        </>
                      ) : (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock size={14} aria-hidden />
                          {user?.id === detail.reporter.id
                            ? 'Waiting for your answer'
                            : `Waiting for ${detail.reporter.name} to reply`}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {detail.resolution && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Resolution</h2>
              <div className="rounded-lg border border-border p-4">
                <p>{detail.resolution.summary}</p>
                {detail.resolution.rootCause && (
                  <>
                    <p className="mt-3 text-xs text-muted-foreground">Root cause</p>
                    <p>{detail.resolution.rootCause}</p>
                  </>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Resolved by {detail.resolution.resolvedBy.name} ·{' '}
                  {formatDate(detail.resolution.at)}
                </p>
              </div>
            </section>
          )}
          <Feedback
            detail={detail}
            focusPrompt={focusFeedback}
            onFocusHandled={clearFocusFeedback}
          />
          <Activity
            detail={detail}
            highlightedEventKey={liveCue?.highlighted ? liveCue.key : null}
          />
        </div>
        <ContextPanel detail={detail} />
      </div>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed right-6 bottom-6 z-40 max-sm:right-4 max-sm:bottom-4"
      >
        {liveCue && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground shadow-pop">
            <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{liveCue.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
const TONE_FILL = {
  active: 'bg-fill-active',
  success: 'bg-fill-success',
  critical: 'bg-fill-critical',
  waiting: 'bg-fill-waiting',
  neutral: 'bg-fill-done',
};
function renderAuditDescription(action: string, text: string, detail: IncidentDetail) {
  const dup = detail.closure?.reason === 'DUPLICATE' ? detail.closure.duplicateOf : null;
  if (action !== 'IncidentClosed' || !dup) return text;
  const index = text.indexOf(dup.number);
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <Link
        to="/incidents/$incidentId"
        params={{ incidentId: dup.id }}
        className="font-medium underline underline-offset-2 hover:text-primary tabular"
      >
        {dup.number}
      </Link>
      {text.slice(index + dup.number.length)}
    </>
  );
}
function Activity({
  detail,
  highlightedEventKey = null,
}: {
  detail: IncidentDetail;
  highlightedEventKey?: string | null;
}) {
  const audit = useIncidentAudit(detail.id);
  const mutation = useIncidentAction(detail.id);
  const now = useNow(60000);
  const [note, setNote] = useState('');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const { user } = useAuth();
  const reporter = user?.id === detail.reporter.id;
  const events = activityEvents(audit.data ?? [], detail.notes, order);
  function addNote() {
    if (note.trim() && !mutation.isPending)
      mutation.mutate({ action: 'addNote', text: note.trim() }, { onSuccess: () => setNote('') });
  }
  const composer = detail.allowedActions.includes('addNote') && (
    <div className="rounded-lg border border-border bg-card focus-within:border-border-strong">
      <textarea
        aria-label={reporter ? 'Additional information' : 'Investigation note'}
        placeholder={
          reporter ? 'Add more information for the technician…' : 'Add an investigation note…'
        }
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            addNote();
          }
        }}
        className="block min-h-16 w-full resize-y border-0 bg-transparent px-3 py-2.5 text-sm outline-none"
      />
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="text-2xs text-muted-foreground">Ctrl/Cmd + Enter to add</span>
        <button
          disabled={!note.trim() || mutation.isPending}
          onClick={addNote}
          className="h-7 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-hover disabled:opacity-50 max-sm:min-h-10"
        >
          {reporter ? 'Add information' : 'Add note'}
        </button>
      </div>
      {mutation.isError && (
        <p role="alert" className="px-3 pb-2 text-xs text-critical-foreground">
          {mutation.error.message}
        </p>
      )}
    </div>
  );
  return (
    <section aria-labelledby="activity">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="activity" className="text-sm font-semibold">
          Activity{' '}
          <span className="font-normal text-muted-foreground tabular">{events.length}</span>
        </h2>
        <div role="group" aria-label="Order" className="flex rounded-md border border-border p-0.5">
          {(['newest', 'oldest'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={order === value}
              onClick={() => setOrder(value)}
              className={`h-6 rounded px-2 text-xs max-sm:min-h-10 ${order === value ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {value === 'newest' ? 'Newest' : 'Oldest'}
            </button>
          ))}
        </div>
      </div>
      {order === 'newest' && composer && <div className="mb-4">{composer}</div>}
      {audit.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : audit.error instanceof ApiError && audit.error.status === 403 ? (
        <p className="text-xs text-muted-foreground">
          The history of this incident is visible to its reporter, its assignee and auditors.
        </p>
      ) : audit.isError ? (
        <p className="text-xs text-muted-foreground">
          Activity could not be loaded.{' '}
          <button className="text-primary" onClick={() => void audit.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        <ol className="relative">
          <span
            aria-hidden
            className="absolute top-2 bottom-2 left-3 w-0.5 -translate-x-1/2 bg-border"
          />
          {events.map((event, i) => {
            const at = new Date(event.at);
            const time = (
              <time dateTime={event.at} className="text-xs text-muted-foreground tabular">
                {formatClock(at, now)}
              </time>
            );
            if (event.kind === 'note') {
              const highlighted =
                highlightedEventKey ===
                liveEventKey({ kind: 'note', at: event.at, authorId: event.entry.author.id });
              return (
                <li
                  key={`n-${event.at}-${i}`}
                  className={`relative -mx-2 flex gap-3 rounded-md px-2 py-2 transition-colors duration-500 motion-reduce:transition-none ${highlighted ? 'bg-primary-subtle' : ''}`}
                >
                  <span
                    className={`relative grid size-6 shrink-0 place-items-center rounded-full bg-fill-done text-fill-foreground ring-4 ${highlighted ? 'ring-primary-subtle' : 'ring-background'}`}
                  >
                    <StickyNote size={13} strokeWidth={2} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 border-b border-border bg-panel px-3 py-1.5 text-xs">
                      <span className="font-semibold text-foreground">
                        {event.entry.author.name}
                      </span>
                      <span className="text-muted-foreground">added a note ·</span>
                      {time}
                    </div>
                    <p className="whitespace-pre-wrap px-3 py-2.5 text-sm">{event.entry.text}</p>
                  </div>
                </li>
              );
            }
            const entry = event.entry;
            const Icon = auditIcons[entry.action] ?? CircleDot;
            const changed =
              entry.toStatus && entry.fromStatus && entry.toStatus !== entry.fromStatus;
            const highlighted =
              highlightedEventKey ===
              liveEventKey({ kind: 'audit', at: event.at, action: entry.action });
            return (
              <li
                key={`a-${event.at}-${i}`}
                className={`relative -mx-2 flex gap-3 rounded-md px-2 py-2 transition-colors duration-500 motion-reduce:transition-none ${highlighted ? 'bg-primary-subtle' : ''}`}
              >
                <span
                  className={`relative grid size-6 shrink-0 place-items-center rounded-full text-fill-foreground ring-4 ${highlighted ? 'ring-primary-subtle' : 'ring-background'} ${TONE_FILL[activityTone(entry.action)]}`}
                >
                  <Icon size={13} strokeWidth={2} aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
                  <span>
                    {renderAuditDescription(
                      entry.action,
                      humanizeAudit(entry.description, detail.number, entry.actor?.name),
                      detail,
                    )}
                  </span>
                  {changed && entry.toStatus && (
                    <StatusPill
                      status={entry.toStatus}
                      duplicate={
                        entry.action === 'IncidentClosed' && detail.closure?.reason === 'DUPLICATE'
                      }
                      small
                    />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {entry.actor && !entry.description.includes(entry.actor.name) && (
                      <>{entry.actor.name} · </>
                    )}
                    {time}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {order === 'oldest' && composer && <div className="mt-4">{composer}</div>}
    </section>
  );
}

/** The reporter rates a verified or closed incident once (1–5 plus an optional comment). */
function Feedback({
  detail,
  focusPrompt = false,
  onFocusHandled,
}: {
  detail: IncidentDetail;
  focusPrompt?: boolean;
  onFocusHandled?: () => void;
}) {
  const mutation = useIncidentAction(detail.id);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const sectionRef = useRef<HTMLElement>(null);
  const firstStarRef = useRef<HTMLInputElement>(null);
  const canGiveFeedback = !detail.feedback && detail.allowedActions.includes('giveFeedback');
  useEffect(() => {
    if (!focusPrompt || !canGiveFeedback) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    sectionRef.current?.scrollIntoView?.({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'center',
    });
    firstStarRef.current?.focus({ preventScroll: true });
    onFocusHandled?.();
  }, [focusPrompt, canGiveFeedback, onFocusHandled]);
  if (detail.feedback)
    return (
      <section aria-labelledby="feedback">
        <h2 id="feedback" className="mb-2 text-sm font-semibold">
          Feedback
        </h2>
        <div className="rounded-lg border border-border p-4">
          <Stars value={detail.feedback.rating} />
          {detail.feedback.comment && <p className="mt-2">{detail.feedback.comment}</p>}
        </div>
      </section>
    );
  if (!canGiveFeedback) return null;
  return (
    <section ref={sectionRef} aria-labelledby="feedback">
      <h2 id="feedback" className="mb-2 text-sm font-semibold">
        How did we do?
      </h2>
      <form
        className="space-y-3 rounded-lg border border-border bg-panel p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (rating && !mutation.isPending)
            mutation.mutate({
              action: 'giveFeedback',
              rating,
              ...(comment.trim() ? { comment: comment.trim() } : {}),
            });
        }}
      >
        <fieldset>
          <legend className="text-xs font-medium">Rate the fix</legend>
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="cursor-pointer">
                <input
                  ref={n === 1 ? firstStarRef : undefined}
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  className="peer sr-only"
                />
                <span className="grid size-8 place-items-center rounded-md peer-focus-visible:outline-2 peer-focus-visible:outline-ring">
                  <Star
                    size={22}
                    strokeWidth={1.75}
                    aria-hidden
                    className={n <= rating ? 'fill-warning text-warning' : 'text-border-strong'}
                  />
                </span>
                <span className="sr-only">{n} out of 5</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-xs font-medium">
          Comment <span className="text-muted-foreground">(optional)</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="mt-1 block min-h-16 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        {mutation.isError && (
          <p role="alert" className="text-xs text-critical-foreground">
            {mutation.error.message}
          </p>
        )}
        <div className="flex justify-end">
          <button className={`${button} ${primary}`} disabled={!rating || mutation.isPending}>
            {mutation.isPending ? 'Sending…' : 'Send feedback'}
          </button>
        </div>
      </form>
    </section>
  );
}
function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={18}
          strokeWidth={1.75}
          aria-hidden
          className={n <= value ? 'fill-warning text-warning' : 'text-border-strong'}
        />
      ))}
      <span className="ml-1.5 text-sm font-medium tabular">{value} / 5</span>
    </div>
  );
}
