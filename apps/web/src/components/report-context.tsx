import type { ServiceSummary } from '@itsm/contracts';
import { useId, type ReactNode, type Ref } from 'react';
import { formatPeopleAffected, priorityPreviewRows } from '@/lib/chat-intake';
import { CRITICALITY_LABEL, formatAssignmentReason, LEVEL_LABEL } from '@/lib/incidents';
import { parsePriorityRationale } from '@/lib/priority-rationale';
import type { ReportForm } from '@/lib/report';
import { cn } from '@/lib/utils';

export function ReportContext({
  children,
  footer,
  reviewHeadingRef,
}: {
  children: ReactNode;
  footer: ReactNode;
  reviewHeadingRef?: Ref<HTMLHeadingElement>;
}) {
  const headingId = useId();
  return (
    <aside
      aria-labelledby={headingId}
      className={cn(
        'min-w-0 self-start rounded-lg border border-border bg-panel',
        reviewHeadingRef ? 'max-lg:rounded-t-none max-lg:border-t-0' : 'max-lg:mt-4',
      )}
    >
      <div className="space-y-3 p-4">
        <h2
          id={headingId}
          ref={reviewHeadingRef}
          className={cn('font-semibold', reviewHeadingRef ? 'scroll-mt-4 text-base' : 'text-xs')}
        >
          {reviewHeadingRef ? 'Review your report' : 'Your report'}
        </h2>
        {children}
      </div>
      <div className="space-y-3 border-t border-border p-4">{footer}</div>
    </aside>
  );
}

export function ReportPriorityPreview({
  form,
  service,
  mode = 'form',
}: {
  form: ReportForm;
  service: ServiceSummary | undefined;
  mode?: 'form' | 'chat';
}) {
  const rows = priorityPreviewRows(form, service, mode);
  if (!rows) return null;
  return (
    <div className="border-t border-border pt-3">
      <p className="text-xs font-semibold text-muted-foreground">How priority is set</p>
      {mode === 'chat' ? (
        <p className="mt-1 text-xs font-medium tabular">{appliedFactors(form, service!)}</p>
      ) : (
        <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {rows.map(({ label, value }) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        We set the exact priority and SLA when you send it.
      </p>
    </div>
  );
}

/** The draft's own factors in words, e.g. "Critical impact × Critical urgency × Mission-critical service, 5,000 people". */
export function appliedFactors(form: ReportForm, service: ServiceSummary) {
  const criticality = CRITICALITY_LABEL[service.criticality]!;
  return (
    `${LEVEL_LABEL[form.impact!]} impact × ${LEVEL_LABEL[form.urgency!]} urgency × ` +
    `${criticality}${service.criticality === 4 ? '' : '-criticality'} service, ` +
    formatPeopleAffected(Number(form.affectedUsers))
  );
}

export function formatReportPriorityReason(reasons: readonly string[]) {
  const lines = reasons.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const calculation = parsePriorityRationale(lines);
  if (!calculation) return lines.join(' · ');
  const { score, comparison, threshold, priority } = calculation;
  return `Score ${score} (${comparison === '<' ? 'below' : `${priority} starts at`} ${threshold})`;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function formatReportAssignmentReason(reason: string) {
  return formatAssignmentReason(reason.trim())
    .split(' · ')
    .map((part) => {
      if (/^lacks .+ skill$/.test(part)) return '';
      const skill = /^has (.+) skill$/.exec(part);
      if (skill) return `Has the ${capitalise(skill[1]!)} skill`;
      const workload = /^(\d+)\/(\d+) active incidents$/.exec(part);
      if (workload) return `Handling ${workload[1]} of ${workload[2]} incidents`;
      return capitalise(part);
    })
    .filter(Boolean)
    .join(' · ');
}
