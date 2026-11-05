import type { IncidentDetail, IncidentInsights } from '@itsm/contracts';
import { Link } from '@tanstack/react-router';
import { Copy, Layers, Lightbulb, Sparkles } from 'lucide-react';
import { useIncidentAction } from '@/lib/incidents';
import { clusterHeadline } from '@/lib/insights';
import { formatScore } from '@/lib/staff';

const small =
  'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-hover disabled:opacity-50';

function Advisory({ source }: { source: IncidentInsights['source'] }) {
  return (
    <p className="mb-2 flex items-center gap-1 text-2xs font-medium uppercase tracking-[0.04em] text-muted-foreground">
      <Sparkles size={12} aria-hidden /> Suggestion · advisory
      <span className="normal-case tracking-normal">
        · {source === 'model' ? 'ML model' : 'rules'}
      </span>
    </p>
  );
}

/** IF-B: several open incidents on one service in a short window point at one cause. */
export function ClusterBanner({
  insights,
  currentId,
}: {
  insights: IncidentInsights;
  currentId: string;
}) {
  const { cluster } = insights;
  if (!cluster) return null;
  return (
    <section
      aria-label="Correlated incidents"
      className="rounded-lg border border-warning/50 bg-warning-subtle p-4"
    >
      <p className="flex items-center gap-2 font-semibold text-warning-foreground">
        <Layers size={16} aria-hidden />
        {clusterHeadline(cluster)}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {cluster.incidents.map((i) => (
          <li key={i.id}>
            {i.id === currentId ? (
              <span className="tabular font-medium">{i.number} (this one)</span>
            ) : (
              <Link
                to="/incidents/$incidentId"
                params={{ incidentId: i.id }}
                className="tabular underline-offset-2 hover:underline"
              >
                {i.number}
              </Link>
            )}{' '}
            <span className="text-muted-foreground">{i.title}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Suggestion · advisory. Check one fix against all of them before closing any as duplicates.
      </p>
    </section>
  );
}

/** IF-A: open incidents that look like this one, with a one-click duplicate close for triage staff. */
export function RelatedPanel({
  detail,
  insights,
}: {
  detail: IncidentDetail;
  insights: IncidentInsights;
}) {
  const mutation = useIncidentAction(detail.id);
  const canClose = detail.allowedActions.includes('closeAsDuplicate');
  return (
    <section>
      <h2 className="mb-1 text-xs font-semibold text-muted-foreground">Possibly related</h2>
      <Advisory source={insights.source} />
      {!insights.similar.length ? (
        <p className="text-xs text-muted-foreground">No similar open incidents.</p>
      ) : (
        <ul className="space-y-3">
          {insights.similar.map(({ incident, score, reasons }) => (
            <li key={incident.id} className="rounded-md border border-border p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  to="/incidents/$incidentId"
                  params={{ incidentId: incident.id }}
                  className="min-w-0 truncate text-sm font-medium hover:underline"
                >
                  <span className="tabular">{incident.number}</span> · {incident.title}
                </Link>
                <span className="shrink-0 text-xs font-semibold tabular">{formatScore(score)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{reasons.join(' · ')}</p>
              {canClose && (
                <button
                  className={`${small} mt-2`}
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ action: 'closeAsDuplicate', duplicateOfId: incident.id })
                  }
                >
                  <Copy size={13} aria-hidden />
                  Close as duplicate of {incident.number}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {mutation.isError && (
        <p role="alert" className="mt-2 text-xs text-critical-foreground">
          {mutation.error.message}
        </p>
      )}
    </section>
  );
}

/** IF-G: how similar problems were fixed before, from resolved incidents. */
export function SuggestedResolutions({ insights }: { insights: IncidentInsights }) {
  if (!insights.suggestedResolutions.length) return null;
  return (
    <section>
      <h2 className="mb-1 text-xs font-semibold text-muted-foreground">Suggested resolutions</h2>
      <Advisory source={insights.source} />
      <ul className="space-y-3">
        {insights.suggestedResolutions.map((s) => (
          <li key={s.incident.id} className="flex gap-2 text-sm">
            <Lightbulb size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p>{s.summary}</p>
              {s.rootCause && (
                <p className="text-xs text-muted-foreground">Root cause: {s.rootCause}</p>
              )}
              <p className="text-xs text-muted-foreground">
                From{' '}
                <Link
                  to="/incidents/$incidentId"
                  params={{ incidentId: s.incident.id }}
                  className="tabular hover:underline"
                >
                  {s.incident.number}
                </Link>{' '}
                · {formatScore(s.score)} match
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
