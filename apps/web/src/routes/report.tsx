import type { IncidentDetail, SimilarIncident, SimilarityRequest } from '@itsm/contracts';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Check, CircleCheck, ListChecks, MessageSquare, SearchCheck, UserX } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { AppShell, initials } from '@/components/app-shell';
import { ReportChat } from '@/components/report-chat';
import {
  formatReportAssignmentReason,
  formatReportPriorityReason,
  ReportContext,
  ReportPriorityPreview,
} from '@/components/report-context';
import {
  applyReading,
  chatCategoryId,
  formatPeopleAffected,
  replyTo,
  startIntake,
} from '@/lib/chat-intake';
import { useChatIntake } from '@/lib/chat-intake-api';
import { PriorityChip, SlaPill, StatusPill } from '@/components/incident/chips';
import { useAuth } from '@/lib/auth';
import { LEVEL_LABEL, useReportIncident, useServices } from '@/lib/incidents';
import { similarityQuery, useDebounced, useSimilarCheck } from '@/lib/insights';
import {
  duplicateOf,
  IMPACT_OPTIONS,
  reportErrors,
  URGENCY_OPTIONS,
  type ReportForm,
} from '@/lib/report';
import { formatClock, formatDuration } from '@/lib/roadmap';
import { useReducedMotion } from '@/lib/reveal';
import { formatScore } from '@/lib/staff';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/report')({ component: ReportPage });

const empty: ReportForm = {
  title: '',
  description: '',
  serviceId: '',
  impact: null,
  urgency: null,
  affectedUsers: '1',
};
const field =
  'mt-1 block w-full rounded-md border border-input bg-background px-3 text-base font-normal text-foreground placeholder:text-muted-foreground aria-invalid:border-critical';

function ReportPage() {
  const { user } = useAuth();
  const services = useServices();
  const servicesReady = !services.isError && !!services.data?.length;
  const formRef = useRef<HTMLFormElement>(null);
  const report = useReportIncident();
  const [form, setForm] = useState(empty);
  const [touched, setTouched] = useState(false);
  const errors = reportErrors(form);
  const set = <K extends keyof ReportForm>(key: K, value: ReportForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const [mode, setMode] = useState<'form' | 'chat'>('form');
  const [chat, setChat] = useState(() => startIntake(empty));
  const [pendingReply, setPendingReply] = useState<string | null>(null);
  const { mutateAsync: readIntake } = useChatIntake();
  const reducedMotion = useReducedMotion();
  const chatCheckRequest = !report.data && mode === 'chat' ? similarityQuery(form) : null;
  const chatCheck = useSimilarCheck(chatCheckRequest);
  const chatAdvisory =
    chatCheckRequest && duplicateCheckStatus(chatCheck, chatCheck.isPlaceholderData);
  async function sendChatReply(value: string, shown: string) {
    if (pendingReply || chat.step === 'review' || !value.trim()) return;
    const message = value.trim();
    const current = { ...chat, form };
    const catalog = services.data ?? [];
    setPendingReply(shown.trim());
    const reading = chat.step === 'problem' ? await readIntake(message) : null;
    if ((!reading?.title?.trim() || reading.engine === 'rules') && !reducedMotion) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
    }
    const next =
      chat.step === 'problem'
        ? applyReading(current, message, reading, catalog)
        : replyTo(current, message, catalog, shown);
    setForm(next.form);
    setChat(next);
    setPendingReply(null);
  }
  function submit(event?: FormEvent) {
    event?.preventDefault();
    setTouched(true);
    const firstError = Object.keys(errors)[0];
    if (firstError) {
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>(`[name="${firstError}"]`)?.focus();
      });
      return;
    }
    if (report.isPending || !servicesReady) return;
    report.mutate({
      title: form.title.trim(),
      description: form.description.trim(),
      serviceId: form.serviceId,
      impact: form.impact!,
      urgency: form.urgency!,
      affectedUsers: Number(form.affectedUsers),
      ...(chatCategoryId(form) && { categoryId: chatCategoryId(form) }),
    });
  }
  const validation = (key: keyof ReportForm) => ({
    id: `report-${key}`,
    name: key,
    'aria-invalid': touched && !!errors[key],
    'aria-describedby': touched && errors[key] ? `report-${key}-error` : undefined,
  });
  const error = (key: keyof ReportForm) =>
    touched && errors[key] ? (
      <p id={`report-${key}-error`} className="mt-1 text-xs font-normal text-critical-foreground">
        {errors[key]}
      </p>
    ) : null;
  return (
    <AppShell>
      <div
        className={cn('px-8 py-6 max-sm:px-4', report.data ? 'max-w-[640px]' : 'max-w-[1120px]')}
      >
        {report.data ? (
          <Confirmation
            incident={report.data}
            onAnother={() => {
              report.reset();
              setForm(empty);
              setChat(startIntake(empty));
              setTouched(false);
            }}
          />
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">Report a problem</h1>

              <div
                role="group"
                aria-label="How to report"
                className="mt-4 inline-flex rounded-md border border-border p-0.5"
              >
                {(
                  [
                    ['form', 'Fill in a form', ListChecks],
                    ['chat', 'Describe it in a chat', MessageSquare],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    aria-pressed={mode === value}
                    disabled={pendingReply !== null}
                    onClick={() => setMode(value)}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded px-3 text-sm ${mode === value ? 'bg-muted font-medium text-foreground ring-1 ring-inset ring-border-strong' : 'text-muted-foreground hover:bg-hover'}`}
                  >
                    <Icon size={14} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {!servicesReady && (
              <div
                role={services.isError ? 'alert' : 'status'}
                className="rounded-lg border border-border bg-panel p-3 text-sm"
              >
                <p
                  className={
                    services.isError ? 'text-critical-foreground' : 'text-muted-foreground'
                  }
                >
                  {services.isError
                    ? 'Services could not load. Your answers are kept; retry to choose a service and send your report.'
                    : services.isLoading
                      ? 'Loading services… You can start describing the problem.'
                      : 'No services are available. Contact your IT team to report this problem.'}
                </p>
                {services.isError && (
                  <button
                    type="button"
                    disabled={services.isFetching}
                    onClick={() => void services.refetch()}
                    className="mt-2 min-h-10 rounded-md border border-border px-3 font-medium hover:bg-hover disabled:opacity-50"
                  >
                    {services.isFetching ? 'Retrying…' : 'Retry loading services'}
                  </button>
                )}
              </div>
            )}
            <div className="grid max-lg:max-w-[680px] lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-x-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              {mode === 'chat' ? (
                <ReportChat
                  state={chat}
                  form={form}
                  onReply={(value, shown) => void sendChatReply(value, shown)}
                  pendingReply={pendingReply}
                  reducedMotion={reducedMotion}
                  services={services.data ?? []}
                  onSubmit={() => submit()}
                  onEditInForm={() => {
                    setTouched(true);
                    setMode('form');
                  }}
                  pending={report.isPending}
                  submitDisabled={!servicesReady}
                  advisory={{
                    content: <AlreadyReported check={chatAdvisory} embedded viewerId={user?.id} />,
                    hasMatches: chatAdvisory?.status === 'ready' && chatAdvisory.matches.length > 0,
                  }}
                  error={
                    report.isError ? (
                      <ReportFailure error={report.error} />
                    ) : chat.step === 'review' && touched && Object.keys(errors).length ? (
                      <p role="alert" className="text-sm text-critical-foreground">
                        Some answers need attention. Edit them in the form.
                      </p>
                    ) : null
                  }
                />
              ) : (
                <>
                  <form
                    id="report-form"
                    ref={formRef}
                    onSubmit={submit}
                    noValidate
                    className="min-w-0 max-w-[680px] space-y-5"
                  >
                    {touched && Object.keys(errors).length > 0 && (
                      <p
                        role="alert"
                        className="rounded-md bg-critical-subtle p-3 text-sm text-critical-foreground"
                      >
                        Check the highlighted answers before sending your report. Your answers have
                        been kept.
                      </p>
                    )}
                    <label className="block text-sm font-medium">
                      What is the problem?
                      <input
                        {...validation('title')}
                        value={form.title}
                        onChange={(e) => set('title', e.target.value)}
                        placeholder="e.g. Checkout payments are failing"
                        className={cn(field, 'h-10')}
                      />
                      {error('title')}
                    </label>
                    <label className="block text-sm font-medium">
                      What happens?
                      <textarea
                        {...validation('description')}
                        value={form.description}
                        onChange={(e) => set('description', e.target.value)}
                        placeholder="What did you try, what did you see, and since when?"
                        className={cn(field, 'min-h-20 resize-y py-2')}
                      />
                      {error('description')}
                    </label>
                    <label className="block text-sm font-medium">
                      Which service is affected?
                      <select
                        disabled={!servicesReady}
                        {...validation('serviceId')}
                        value={form.serviceId}
                        onChange={(e) => set('serviceId', e.target.value)}
                        className={cn(field, 'h-10')}
                      >
                        <option value="">
                          {services.isLoading ? 'Loading services…' : 'Choose a service'}
                        </option>
                        {services.data?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {error('serviceId')}
                    </label>
                    <Choice
                      legend="How badly is work affected?"
                      options={IMPACT_OPTIONS}
                      value={form.impact}
                      onChange={(v) => set('impact', v)}
                      name="impact"
                      invalid={touched && !!errors.impact}
                      error={error('impact')}
                    />
                    <Choice
                      legend="How soon does it need fixing?"
                      options={URGENCY_OPTIONS}
                      value={form.urgency}
                      onChange={(v) => set('urgency', v)}
                      name="urgency"
                      invalid={touched && !!errors.urgency}
                      error={error('urgency')}
                    />
                    <label className="block text-sm font-medium">
                      About how many people are affected?
                      <input
                        type="number"
                        min={1}
                        max={1_000_000}
                        inputMode="numeric"
                        {...validation('affectedUsers')}
                        value={form.affectedUsers}
                        onChange={(e) => set('affectedUsers', e.target.value)}
                        className={cn(field, 'h-10 w-40 tabular')}
                      />
                      {error('affectedUsers')}
                    </label>
                  </form>
                  <ReportContext
                    footer={
                      <>
                        {report.isError && <ReportFailure error={report.error} />}
                        <button
                          type="submit"
                          form="report-form"
                          disabled={report.isPending || !servicesReady}
                          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
                        >
                          {report.isPending ? 'Sending…' : 'Send report'}
                        </button>
                      </>
                    }
                  >
                    {!similarityQuery(form) && !(form.impact && form.urgency && form.serviceId) && (
                      <p className="text-sm text-muted-foreground">
                        Answer the questions to finish your draft.
                      </p>
                    )}
                    <FormDuplicateAdvisory form={form} viewerId={user?.id} />
                    <ReportPriorityPreview
                      form={form}
                      service={services.data?.find((service) => service.id === form.serviceId)}
                    />
                  </ReportContext>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/** A rejected report; a duplicate links to the incident the reporter already has open. */
function ReportFailure({ error }: { error: Error }) {
  const existing = duplicateOf(error);
  return (
    <p role="alert" className="text-sm text-critical-foreground">
      {error.message}
      {existing && (
        <>
          {' '}
          <Link
            to="/incidents/$incidentId"
            params={{ incidentId: existing.id }}
            className="inline-flex min-h-10 items-center font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
          >
            Follow {existing.number ?? 'your earlier report'}
          </Link>
        </>
      )}
    </p>
  );
}

type DuplicateCheck =
  { status: 'loading' | 'error' } | { status: 'ready'; matches: readonly SimilarIncident[] };

function duplicateCheckStatus(
  check: ReturnType<typeof useSimilarCheck>,
  waiting: boolean,
): DuplicateCheck {
  if (check.isLoading || waiting) return { status: 'loading' };
  if (check.isError) return { status: 'error' };
  return { status: 'ready', matches: check.data ?? [] };
}

function FormDuplicateAdvisory({ form, viewerId }: { form: ReportForm; viewerId?: string }) {
  const current = similarityQuery(form);
  // Debounce the serialised request: a fresh object every render would never settle.
  const key = JSON.stringify(current);
  const settled = useDebounced(key, 500);
  const check = useSimilarCheck(current && (JSON.parse(settled) as SimilarityRequest | null));
  return (
    <AlreadyReported
      check={current && duplicateCheckStatus(check, settled !== key && !check.data)}
      viewerId={viewerId}
    />
  );
}

/** IF-A: warns about likely duplicates while the employee types; it never blocks the report. */
function AlreadyReported({
  check,
  embedded = false,
  viewerId,
}: {
  check: DuplicateCheck | null;
  embedded?: boolean;
  viewerId?: string;
}) {
  if (!check) return null;
  const matches = check.status === 'ready' ? check.matches : [];
  const ranked = embedded ? matches.toSorted((a, b) => b.score - a.score) : matches;
  const visible = embedded ? ranked.slice(0, 1) : ranked;
  const more = embedded ? ranked.slice(1) : [];
  return (
    <section
      aria-live="polite"
      aria-label="Is this already reported?"
      className="border-t border-border pt-3"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <SearchCheck size={16} aria-hidden />
          Is this already reported?
        </h3>
        {!!matches.length && (
          <span className="rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground">
            Advisory
          </span>
        )}
      </div>
      {check.status === 'loading' ? (
        <p className="mt-1 text-sm text-muted-foreground">Checking open incidents…</p>
      ) : check.status === 'error' ? (
        <p className="mt-1 text-sm text-muted-foreground">The check is unavailable right now.</p>
      ) : !matches.length ? (
        <p className="mt-1 text-sm text-muted-foreground">No similar open incidents found.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            These open incidents look similar. If one is your problem, you can follow it instead.
          </p>
          <ul className="mt-2 space-y-2">
            {visible.map((match) => (
              <DuplicateMatch key={match.incident.id} match={match} viewerId={viewerId} />
            ))}
          </ul>
          {!!more.length && (
            <details className="mt-2">
              <summary className="w-fit cursor-pointer rounded-sm py-1 text-sm font-medium tabular hover:text-muted-foreground">
                {more.length} more possible {more.length === 1 ? 'match' : 'matches'}
              </summary>
              <ul className="mt-1 space-y-2">
                {more.map((match) => (
                  <DuplicateMatch key={match.incident.id} match={match} viewerId={viewerId} />
                ))}
              </ul>
            </details>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            If your problem is different, send your own report.
          </p>
        </>
      )}
    </section>
  );
}

function DuplicateMatch({
  match: { incident, score, reasons },
  viewerId,
}: {
  match: SimilarIncident;
  viewerId?: string;
}) {
  const reportedByYou = !!viewerId && incident.reporter.id === viewerId;
  const explanation = reasons
    .map((reason) => reason.replace(/\s*\([^()]*\)/g, '').trim())
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="rounded-md border border-border bg-background p-3">
      <Link
        to="/incidents/$incidentId"
        params={{ incidentId: incident.id }}
        className="inline-block max-w-full text-sm font-medium break-words text-foreground underline underline-offset-4 hover:text-muted-foreground"
      >
        <span className="tabular">{incident.number}</span> · {incident.title}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <StatusPill status={incident.status} small />
        <span className="tabular">{formatScore(score)} match</span>
        {reportedByYou && <span className="font-medium text-foreground">Reported by you</span>}
        {explanation && <span className="min-w-0 break-words">{explanation}</span>}
      </div>
      <Link
        to="/incidents/$incidentId"
        params={{ incidentId: incident.id }}
        className="mt-2 inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-hover"
      >
        Follow <span className="ml-1 tabular">{incident.number}</span>
      </Link>
    </li>
  );
}

function Choice({
  legend,
  name,
  invalid,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  name: string;
  invalid: boolean;
  options: readonly { value: number; label: string; hint?: string }[];
  value: number | null;
  onChange: (value: number) => void;
  error: React.ReactNode;
}) {
  return (
    <fieldset
      aria-invalid={invalid}
      aria-describedby={invalid ? `report-${name}-error` : undefined}
    >
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex min-h-10 cursor-pointer gap-2.5 rounded-lg border px-3 py-2 has-focus-visible:outline-2 has-focus-visible:outline-ring ${value === option.value ? 'border-primary bg-primary-subtle' : `${invalid ? 'border-critical' : 'border-border'} hover:bg-hover`}`}
          >
            <input
              type="radio"
              name={name}
              aria-invalid={invalid}
              aria-describedby={invalid ? `report-${name}-error` : undefined}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="mt-0.5 accent-[var(--primary)]"
            />
            <span>
              <span className="block text-sm font-medium">{option.label}</span>
              {option.hint && (
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {error}
    </fieldset>
  );
}

function TargetTime({ deadline, now }: { deadline: string; now: Date }) {
  const at = new Date(deadline);
  const left = at.getTime() - now.getTime();
  const duration = formatDuration(left).replace(/ 00m$/, '');
  return (
    <>
      <time dateTime={deadline} className="font-semibold">
        {formatClock(at, now)}
      </time>{' '}
      <span className="whitespace-nowrap text-muted-foreground">
        · {left < 0 ? `${duration} ago` : `in ${duration}`}
      </span>
    </>
  );
}

function Confirmation({
  incident,
  onAnother,
}: {
  incident: IncidentDetail;
  onAnother: () => void;
}) {
  const now = useNow();
  const rationale = formatReportPriorityReason(incident.priorityRationale ?? []);
  const assignmentReasons = (incident.assignmentReasons ?? [])
    .map(formatReportAssignmentReason)
    .filter(Boolean)
    .slice(0, 2);
  const impact = LEVEL_LABEL[incident.impact];
  const caption = [
    incident.service?.name.trim(),
    impact && `${impact} impact`,
    incident.affectedUsers && formatPeopleAffected(incident.affectedUsers),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <CircleCheck size={28} className="shrink-0 text-success-foreground" aria-hidden />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">We have your report</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular break-words">
            {incident.number} · {incident.title}
          </p>
          {caption && (
            <p className="mt-1 text-xs text-muted-foreground tabular break-words">{caption}</p>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Follow this incident for updates, to answer requests from IT and to confirm whether the fix
        worked.
      </p>
      <dl className="divide-y divide-border rounded-lg border border-border">
        <div className="flex items-start justify-between gap-3 p-4">
          <dt className="shrink-0 pt-0.5 text-sm font-medium">Priority</dt>
          <dd className="min-w-0 text-right">
            <PriorityChip priority={incident.priority} />
            {rationale && (
              <p className="mt-1 truncate text-xs text-muted-foreground tabular" title={rationale}>
                {rationale}
              </p>
            )}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3 p-4">
          <dt className="shrink-0 pt-1 text-sm font-medium">Who is on it</dt>
          <dd className="min-w-0">
            {incident.assignee ? (
              <>
                <div className="flex items-center justify-end gap-2">
                  <span
                    aria-hidden
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-2xs font-semibold"
                  >
                    {initials(incident.assignee.name)}
                  </span>
                  <span className="min-w-0 text-right font-medium break-words">
                    {incident.assignee.name}
                  </span>
                </div>
                {!!assignmentReasons.length && (
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground tabular">
                    {assignmentReasons.map((reason, index) => (
                      <li key={index} className="flex items-start gap-1.5">
                        <Check
                          size={12}
                          className="mt-0.5 shrink-0 text-success-foreground"
                          aria-hidden
                        />
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <UserX size={14} aria-hidden />
                Waiting for assignment
              </span>
            )}
          </dd>
        </div>
        {incident.slaDeadlines && (
          <div className="flex flex-wrap items-start justify-between gap-2 p-4">
            <dt className="text-sm font-medium">Service targets</dt>
            <dd className="text-sm tabular sm:text-right">
              <div>
                Respond by <TargetTime deadline={incident.slaDeadlines.response} now={now} />
              </div>
              <div>
                Resolve by <TargetTime deadline={incident.slaDeadlines.resolution} now={now} />
              </div>
              {incident.slaStatus && (
                <div className="mt-1.5">
                  <SlaPill status={incident.slaStatus} />
                </div>
              )}
            </dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/incidents/$incidentId"
          params={{ incidentId: incident.id }}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary-hover max-sm:w-full"
        >
          Follow this incident
        </Link>
        <button
          onClick={onAnother}
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-border px-4 text-base hover:bg-hover max-sm:w-full"
        >
          Report another problem
        </button>
      </div>
    </div>
  );
}
