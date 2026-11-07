import type { IncidentDetail } from '@itsm/contracts';
import { Copy, Sparkles, UserCog } from 'lucide-react';
import { useState } from 'react';
import { useIncidentAction, useIncidents, useRecommendations } from '@/lib/incidents';
import { duplicateCandidates, formatScore } from '@/lib/staff';

const small =
  'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-hover disabled:opacity-50 max-sm:min-h-10';

/** Team leads, admins and managers reassign with advisory recommendations (score and reasons). */
export function AssignPanel({ detail }: { detail: IncidentDetail }) {
  const [open, setOpen] = useState(false);
  const recommendations = useRecommendations(detail.id, open);
  const mutation = useIncidentAction(detail.id);
  if (!detail.allowedActions.includes('assign')) return null;
  return (
    <div className="mt-3">
      <button className={small} onClick={() => setOpen(!open)} aria-expanded={open}>
        <UserCog size={13} aria-hidden />
        {detail.assignee ? 'Reassign' : 'Assign'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="flex items-center gap-1 text-2xs font-medium uppercase tracking-[0.04em] text-muted-foreground">
            <Sparkles size={12} aria-hidden /> Suggestions · advisory
          </p>
          {recommendations.isLoading ? (
            <div className="h-16 animate-pulse rounded-md bg-muted" />
          ) : recommendations.isError ? (
            <p className="text-xs text-critical-foreground">Suggestions could not load.</p>
          ) : !recommendations.data?.length ? (
            <p className="text-xs text-muted-foreground">
              No available technician has spare capacity right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {recommendations.data?.map((r) => {
                const current = r.technician.id === detail.assignee?.id;
                return (
                  <li
                    key={r.technician.id}
                    className="rounded-md border border-border bg-background p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{r.technician.name}</span>
                      <span
                        className="text-xs text-muted-foreground tabular"
                        title={`Strategy: ${r.strategy}`}
                      >
                        match {formatScore(r.score)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.reasons.join(' · ')}</p>
                    <button
                      className={`${small} mt-2`}
                      disabled={current || mutation.isPending}
                      onClick={() =>
                        mutation.mutate(
                          { action: 'assign', technicianId: r.technician.id },
                          { onSuccess: () => setOpen(false) },
                        )
                      }
                    >
                      {current
                        ? 'Current assignee'
                        : `Assign to ${r.technician.name.split(' ')[0]}`}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {mutation.isError && (
            <p role="alert" className="text-xs text-critical-foreground">
              {mutation.error.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Close this incident as a duplicate of another open one on the same service. */
export function DuplicatePanel({ detail }: { detail: IncidentDetail }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const list = useIncidents(`limit=200&serviceId=${detail.service.id}`);
  const mutation = useIncidentAction(detail.id);
  if (!detail.allowedActions.includes('closeAsDuplicate')) return null;
  const candidates = duplicateCandidates(detail, list.data ?? []);
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold text-muted-foreground">Duplicates</h2>
      {!open ? (
        <button className={small} onClick={() => setOpen(true)}>
          <Copy size={13} aria-hidden />
          Close as duplicate…
        </button>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (target) mutation.mutate({ action: 'closeAsDuplicate', duplicateOfId: target });
          }}
        >
          <label className="block text-xs font-medium">
            Duplicate of
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 block h-8 w-full rounded-md border border-input bg-background px-2 text-sm max-sm:min-h-10"
            >
              <option value="">
                {list.isLoading
                  ? 'Loading open incidents…'
                  : list.isError
                    ? 'Open incidents could not load'
                    : candidates.length
                      ? 'Choose an open incident'
                      : `No other open ${detail.service.name} incidents`}
              </option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number} · {c.title}
                </option>
              ))}
            </select>
          </label>
          {mutation.isError && (
            <p role="alert" className="text-xs text-critical-foreground">
              {mutation.error.message}
            </p>
          )}
          <div className="flex gap-2">
            <button className={small} disabled={!target || mutation.isPending}>
              Close as duplicate
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground max-sm:inline-flex max-sm:min-h-10 max-sm:items-center max-sm:px-2"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
