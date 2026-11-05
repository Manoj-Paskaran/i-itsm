import type { IncidentDetail, SimilarityRequest } from '@itsm/contracts';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CircleCheck, ListChecks, MessageSquare, SearchCheck, UserX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AppShell, initials } from '@/components/app-shell';
import { ReportChat } from '@/components/report-chat';
import { startIntake } from '@/lib/chat-intake';
import { PriorityChip, SlaPill } from '@/components/incident/chips';
import { STATUS_LABEL, useReportIncident, useServices } from '@/lib/incidents';
import { similarityQuery, useDebounced, useSimilarCheck } from '@/lib/insights';
import {
  duplicateOf,
  IMPACT_OPTIONS,
  reportErrors,
  URGENCY_OPTIONS,
  type ReportForm,
} from '@/lib/report';
import { formatClock } from '@/lib/roadmap';
import { formatScore } from '@/lib/staff';

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
  'mt-1 block w-full rounded-md border border-input bg-background px-3 text-base text-foreground';

function ReportPage() {
  const services = useServices();
  const report = useReportIncident();
  const [form, setForm] = useState(empty);
  const [touched, setTouched] = useState(false);
  const errors = reportErrors(form);
  const set = <K extends keyof ReportForm>(key: K, value: ReportForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const [mode, setMode] = useState<'form' | 'chat'>('form');
  const [chat, setChat] = useState(() => startIntake(empty));
  function submit(event?: FormEvent) {
    event?.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length || report.isPending) return;
    report.mutate({
      title: form.title.trim(),
      description: form.description.trim(),
      serviceId: form.serviceId,
      impact: form.impact!,
      urgency: form.urgency!,
      affectedUsers: Number(form.affectedUsers),
    });
  }
  const error = (key: keyof ReportForm) =>
    touched && errors[key] ? (
      <p className="mt-1 text-xs text-critical-foreground">{errors[key]}</p>
    ) : null;
  return (
    <AppShell>
      <div className="mx-auto max-w-[640px] px-6 py-8 max-sm:px-4">
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
              <p className="mt-1 text-muted-foreground">
                Tell us what is wrong. We set the priority and find the right person for you.
              </p>
              <div
                role="tablist"
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
                    role="tab"
                    aria-selected={mode === value}
                    onClick={() => setMode(value)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-sm ${mode === value ? 'bg-primary-subtle font-medium text-primary' : 'text-muted-foreground hover:bg-hover'}`}
                  >
                    <Icon size={14} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {mode === 'chat' ? (
              <>
                <ReportChat
                  state={chat}
                  onState={setChat}
                  form={form}
                  onForm={setForm}
                  services={services.data ?? []}
                  onSubmit={() => submit()}
                  onEditInForm={() => {
                    setTouched(true);
                    setMode('form');
                  }}
                  pending={report.isPending}
                  error={
                    report.isError ? (
                      <ReportFailure error={report.error} />
                    ) : touched && Object.keys(errors).length ? (
                      <p role="alert" className="text-sm text-critical-foreground">
                        Some answers are missing. Edit them in the form.
                      </p>
                    ) : null
                  }
                />
                <AlreadyReported form={form} />
              </>
            ) : (
              <form onSubmit={submit} noValidate className="space-y-6">
                <label className="block text-sm font-medium">
                  What is the problem?
                  <input
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    placeholder="e.g. Checkout payments are failing"
                    className={`${field} h-10`}
                  />
                  {error('title')}
                </label>
                <label className="block text-sm font-medium">
                  What happens?
                  <textarea
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder="What did you try, what did you see, and since when?"
                    className={`${field} min-h-28 resize-y py-2`}
                  />
                  {error('description')}
                </label>
                <label className="block text-sm font-medium">
                  Which service is affected?
                  <select
                    value={form.serviceId}
                    onChange={(e) => set('serviceId', e.target.value)}
                    className={`${field} h-10`}
                  >
                    <option value="">Choose a service</option>
                    {services.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {services.isError && (
                    <p className="mt-1 text-xs text-critical-foreground">
                      Services could not load.
                    </p>
                  )}
                  {error('serviceId')}
                </label>
                <AlreadyReported form={form} />
                <Choice
                  legend="How badly is work affected?"
                  options={IMPACT_OPTIONS}
                  value={form.impact}
                  onChange={(v) => set('impact', v)}
                  error={error('impact')}
                />
                <Choice
                  legend="How soon does it need fixing?"
                  options={URGENCY_OPTIONS}
                  value={form.urgency}
                  onChange={(v) => set('urgency', v)}
                  error={error('urgency')}
                />
                <label className="block text-sm font-medium">
                  About how many people are affected?
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={form.affectedUsers}
                    onChange={(e) => set('affectedUsers', e.target.value)}
                    className={`${field} h-10 w-40 tabular`}
                  />
                  {error('affectedUsers')}
                </label>
                {report.isError && <ReportFailure error={report.error} />}
                <button
                  disabled={report.isPending}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
                >
                  {report.isPending ? 'Sending…' : 'Send report'}
                </button>
              </form>
            )}
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
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Follow {existing.number ?? 'your earlier report'}
          </Link>
        </>
      )}
    </p>
  );
}

/** IF-A: warns about likely duplicates while the employee types; it never blocks the report. */
function AlreadyReported({ form }: { form: ReportForm }) {
  const current = similarityQuery(form);
  // Debounce the serialised request: a fresh object every render would never settle.
  const settled = useDebounced(JSON.stringify(current), 500);
  const check = useSimilarCheck(current && (JSON.parse(settled) as SimilarityRequest | null));
  if (!current) return null;
  const matches = check.data ?? [];
  return (
    <section
      aria-live="polite"
      aria-label="Is this already reported?"
      className="rounded-lg border border-border bg-panel p-4"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <SearchCheck size={16} aria-hidden />
        Is this already reported?
      </p>
      {check.isLoading || (settled !== JSON.stringify(current) && !check.data) ? (
        <p className="mt-1 text-sm text-muted-foreground">Checking open incidents…</p>
      ) : check.isError ? (
        <p className="mt-1 text-sm text-muted-foreground">The check is unavailable right now.</p>
      ) : !matches.length ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing similar is open. Send your report below.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            These open incidents look similar. If one is your problem, you can follow it instead.
          </p>
          <ul className="mt-2 space-y-2">
            {matches.map(({ incident, score, reasons }) => (
              <li key={incident.id} className="text-sm">
                <Link
                  to="/incidents/$incidentId"
                  params={{ incidentId: incident.id }}
                  className="font-medium text-primary hover:underline"
                >
                  <span className="tabular">{incident.number}</span> · {incident.title}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {STATUS_LABEL[incident.status]} · {formatScore(score)} match ·{' '}
                  {reasons.join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Suggestion · advisory. Still different? Send your report below.
          </p>
        </>
      )}
    </section>
  );
}

function Choice({
  legend,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  options: readonly { value: number; label: string; hint?: string }[];
  value: number | null;
  onChange: (value: number) => void;
  error: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2.5 has-focus-visible:outline-2 has-focus-visible:outline-ring ${value === option.value ? 'border-primary bg-primary-subtle' : 'border-border hover:bg-hover'}`}
          >
            <input
              type="radio"
              name={legend}
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

function Confirmation({
  incident,
  onAnother,
}: {
  incident: IncidentDetail;
  onAnother: () => void;
}) {
  const now = new Date();
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <CircleCheck size={28} className="shrink-0 text-success-foreground" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold">We have your report</h1>
          <p className="text-muted-foreground tabular">
            {incident.number} · {incident.title}
          </p>
        </div>
      </div>
      <dl className="divide-y divide-border rounded-lg border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <dt className="text-sm font-medium">Priority</dt>
          <dd>
            <PriorityChip priority={incident.priority} />
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <dt className="text-sm font-medium">Who is on it</dt>
          <dd className="flex items-center gap-2">
            {incident.assignee ? (
              <>
                <span className="grid size-7 place-items-center rounded-full bg-muted text-2xs font-semibold">
                  {initials(incident.assignee.name)}
                </span>
                <span className="font-medium">{incident.assignee.name}</span>
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
            <dt className="text-sm font-medium">When to expect it</dt>
            <dd className="text-right text-sm tabular">
              <div>
                First response by{' '}
                <span className="font-semibold">
                  {formatClock(new Date(incident.slaDeadlines.response), now)}
                </span>
              </div>
              <div>
                Fixed by{' '}
                <span className="font-semibold">
                  {formatClock(new Date(incident.slaDeadlines.resolution), now)}
                </span>
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
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          Follow this incident
        </Link>
        <button
          onClick={onAnother}
          className="inline-flex h-10 items-center rounded-md border border-border px-4 text-base hover:bg-hover"
        >
          Report another problem
        </button>
      </div>
    </div>
  );
}
