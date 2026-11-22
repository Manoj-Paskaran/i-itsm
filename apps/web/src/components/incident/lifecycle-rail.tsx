import type { IncidentDetail } from '@itsm/contracts';
import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { Fragment } from 'react';
import { roadmap, formatClock, type AuditEntry, type Tone } from '@/lib/roadmap';
import { useAuth } from '@/lib/auth';
import { useNow } from '@/lib/use-now';

const TONE: Record<Tone, string> = {
  muted: 'text-muted-foreground',
  success: 'text-success-foreground',
  warning: 'text-warning-foreground font-medium',
  critical: 'text-critical-foreground font-medium',
};

/**
 * Two-line lifecycle roadmap. Reached steps carry a check and the time they were reached; the step
 * after them is the phase in progress, with who it waits for. SLA deadlines sit under the steps they
 * measure (response under Acknowledged, resolution under Resolved).
 */
export function LifecycleRail({ detail, audit }: { detail: IncidentDetail; audit: AuditEntry[] }) {
  const now = useNow();
  const { user } = useAuth();
  const steps = roadmap(detail, audit, now, user?.id);
  return (
    <ol
      aria-label="Lifecycle"
      className="grid gap-0 max-lg:grid-cols-1 lg:grid-flow-col lg:auto-cols-fr"
    >
      {steps.map((step, i) => {
        const warn = step.phase?.tone === 'warning';
        const next = steps[i + 1];
        const accent = warn ? 'text-warning' : 'text-primary';
        return (
          <li
            key={step.label}
            aria-current={step.state === 'active' ? 'step' : undefined}
            className="flex gap-3 lg:block"
          >
            <div className="flex flex-col items-center lg:flex-row">
              <span
                className={`grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-200 ease-out-expo ${
                  step.state === 'reached'
                    ? 'bg-primary text-primary-foreground'
                    : step.state === 'active'
                      ? `border-2 bg-background ${warn ? 'border-warning' : 'border-primary'}`
                      : 'border-2 border-border-strong bg-background'
                }`}
              >
                {step.state === 'reached' ? (
                  <Check size={12} strokeWidth={3} aria-hidden />
                ) : step.state === 'active' ? (
                  <span
                    className={`size-2 animate-pulse rounded-full ${warn ? 'bg-warning' : 'bg-primary'}`}
                  />
                ) : null}
              </span>
              {next && (
                <span
                  aria-hidden
                  className={`min-h-4 w-0.5 flex-1 lg:mx-1.5 lg:h-0.5 lg:min-h-0 lg:w-auto ${
                    next.state === 'reached'
                      ? 'bg-primary'
                      : next.state === 'active'
                        ? `connector-active ${next.phase?.tone === 'warning' ? 'text-warning' : 'text-primary'}`
                        : 'bg-border-strong'
                  }`}
                />
              )}
            </div>
            <div className="min-w-0 pb-4 lg:pt-2 lg:pr-4 lg:pb-0">
              <div
                className={`text-sm ${step.state === 'upcoming' ? 'text-muted-foreground' : 'font-semibold text-foreground'}`}
              >
                {step.label}
                <span className="sr-only">
                  {step.state === 'reached'
                    ? ', done'
                    : step.state === 'active'
                      ? ', in progress'
                      : ', not started'}
                </span>
              </div>
              {step.reachedAt && (
                <time
                  dateTime={step.reachedAt.toISOString()}
                  className="block text-xs text-muted-foreground tabular"
                >
                  {formatClock(step.reachedAt, now)}
                </time>
              )}
              {step.phase && (
                <div className={`text-xs font-medium ${warn ? 'text-warning-foreground' : accent}`}>
                  <Segments text={step.phase.text} />
                </div>
              )}
              {step.noteLink ? (
                <div className="text-xs text-muted-foreground">
                  Duplicate of{' '}
                  <Link
                    to="/incidents/$incidentId"
                    params={{ incidentId: step.noteLink.incidentId }}
                    className="font-medium text-foreground underline underline-offset-2 hover:text-primary tabular"
                  >
                    {step.noteLink.number}
                  </Link>
                </div>
              ) : (
                step.note && <div className="text-xs text-muted-foreground">{step.note}</div>
              )}
              {step.sla && (
                <div className={`mt-0.5 text-xs tabular ${TONE[step.sla.tone]}`}>
                  <Segments text={step.sla.text} emphasiseLast tone={step.sla.tone} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Stack phrases in desktop columns; keep the compact, separated form in the vertical rail. */
function Segments({
  text,
  emphasiseLast = false,
  tone = 'muted',
}: {
  text: string;
  emphasiseLast?: boolean;
  tone?: Tone;
}) {
  const parts = text.split(' · ');
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <span className="lg:hidden"> · </span>}
      <span
        className={`whitespace-nowrap lg:block lg:whitespace-normal ${emphasiseLast && i > 0 && part !== 'paused' && !part.endsWith('left when resumed') && !part.endsWith('early') ? `font-medium ${tone === 'muted' ? 'text-foreground' : ''}` : ''}`}
      >
        {part}
      </span>
    </Fragment>
  ));
}
