import type { IncidentDetail } from '@itsm/contracts';
import { Check, UserX } from 'lucide-react';
import { initials } from '@/components/app-shell';
import { CRITICALITY_LABEL, formatAssignmentReason } from '@/lib/incidents';
import { useWorkspaceInsights } from '@/lib/insights';
import { useNow } from '@/lib/use-now';
import { RiskBadge } from './chips';
import { Advisory, RelatedPanel, SuggestedResolutions } from './insights-panel';
import { PriorityCalculation } from './priority-calculation';
import { AssignPanel, DuplicatePanel } from './staff-actions';
export function formatDate(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
export function ContextPanel({ detail }: { detail: IncidentDetail }) {
  const insights = useWorkspaceInsights(detail);
  const now = useNow();
  const riskReasons = insights?.slaRisk?.reasons.join(' · ') ?? '';
  return (
    <aside
      aria-label="Incident context"
      className="min-w-0 border-l border-border bg-panel px-5 py-6 max-lg:border-t max-lg:border-l-0 max-sm:px-4"
    >
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground">Priority</h2>
          <PriorityCalculation detail={detail} />
        </section>
        <section>
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground">Assignee</h2>
          {detail.assignee ? (
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-muted text-2xs font-semibold text-foreground">
                {initials(detail.assignee.name)}
              </span>
              <span className="font-medium">{detail.assignee.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <UserX size={14} aria-hidden />
              Waiting for assignment
            </div>
          )}
          {!!detail.assignmentReasons.length && (
            <>
              <p className="mt-3 text-xs font-medium">Why {detail.assignee?.name.split(' ')[0]}</p>
              <ul className="mt-1 space-y-1">
                {detail.assignmentReasons.map(formatAssignmentReason).map((reason, i) => (
                  <li key={i} className="flex gap-1.5 text-xs text-muted-foreground">
                    <Check size={12} className="shrink-0 text-success-foreground" aria-hidden />
                    {reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          <AssignPanel detail={detail} />
        </section>
        {insights?.slaRisk &&
          detail.slaDeadlines &&
          Date.parse(detail.slaDeadlines.resolution) > now.getTime() && (
            <section>
              <h2 className="mb-1 text-xs font-semibold text-muted-foreground">Breach forecast</h2>
              <Advisory source={insights.slaRisk.source} />
              <RiskBadge risk={insights.slaRisk} />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {riskReasons.charAt(0).toUpperCase() + riskReasons.slice(1)}
              </p>
            </section>
          )}
        {insights && <RelatedPanel detail={detail} insights={insights} />}
        <DuplicatePanel detail={detail} />
        {insights && <SuggestedResolutions insights={insights} />}
        <section>
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground">Details</h2>
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-2 text-sm">
            {[
              ['Service', detail.service.name],
              ['Criticality', CRITICALITY_LABEL[detail.service.criticality]],
              ['Reporter', detail.reporter.name],
              ...(detail.reopenCount ? [['Reopened', String(detail.reopenCount)]] : []),
            ].map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-xs leading-5 text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words tabular">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </aside>
  );
}
