import type { IncidentDetail } from '@itsm/contracts';
import { Check, Copy, Sparkles, UserCog } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatReportAssignmentReason } from '@/components/report-context';
import { useAuth } from '@/lib/auth';
import { useIncidentAction, useIncidents, useRecommendations } from '@/lib/incidents';
import { duplicateCandidates, formatScore } from '@/lib/staff';

const small =
  'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-hover disabled:opacity-50 max-sm:min-h-10';

/** Split compound assignment reasons on ' · ', format each like the report confirmation, drop empties. */
export function formatAssignmentReasons(reasons: readonly string[]): string[] {
  return reasons
    .flatMap((reason) => reason.split(' · '))
    .map((part) => formatReportAssignmentReason(part))
    .filter(Boolean);
}

/** Button label for a reassignment candidate row. */
export function assignButtonLabel(
  technicianName: string,
  current: boolean,
  isSelf: boolean,
): string {
  if (current) return 'Current assignee';
  if (isSelf) return 'Assign to yourself';
  return `Assign to ${technicianName.split(' ')[0]}`;
}

/** Resolve the Duplicate-of select value: honour an explicit user choice, else preselect the top match. */
export function resolveDuplicateTarget(
  selected: string | null,
  suggestedId: string | undefined,
  candidateIds: readonly string[],
): string {
  if (selected !== null) return selected;
  if (suggestedId && candidateIds.includes(suggestedId)) return suggestedId;
  return '';
}

/**
 * Jump the incident page's scroll container (`<main>` in AppShell, else window) to the top.
 * The refetched page commits afterwards and shortens the rail; the browser's scroll anchoring
 * would push the page back down, so anchoring is off for a moment and the jump repeats.
 */
export function scrollPageToTop(container?: Element | null) {
  const target =
    container ?? (typeof document !== 'undefined' ? document.querySelector('main') : null);
  const jump = () => {
    if (target && typeof target.scrollTo === 'function') target.scrollTo({ top: 0 });
    else if (typeof window !== 'undefined' && typeof window.scrollTo === 'function')
      window.scrollTo({ top: 0 });
  };
  const style = target instanceof HTMLElement ? target.style : null;
  if (style) style.overflowAnchor = 'none';
  jump();
  setTimeout(() => {
    jump();
    if (style) style.overflowAnchor = '';
  }, 1000);
}

/** Team leads, admins and managers reassign with advisory recommendations (score and reasons). */
export function AssignPanel({ detail }: { detail: IncidentDetail }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const recommendations = useRecommendations(detail.id, open);
  const mutation = useIncidentAction(detail.id);
  const loadedCount = recommendations.data?.length ?? 0;
  useEffect(() => {
    if (!open) return;
    panelRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [open, recommendations.isLoading, loadedCount]);
  if (!detail.allowedActions.includes('assign')) return null;
  return (
    <div className="mt-3">
      <button className={small} onClick={() => setOpen(!open)} aria-expanded={open}>
        <UserCog size={13} aria-hidden />
        {detail.assignee ? 'Reassign' : 'Assign'}
      </button>
      {open && (
        <div ref={panelRef} className="mt-2 space-y-2">
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
                const isSelf = r.technician.id === user?.id;
                const reasons = formatAssignmentReasons(r.reasons);
                return (
                  <li
                    key={r.technician.id}
                    className="rounded-md border border-border bg-background p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {r.technician.name}
                        {isSelf && (
                          <span className="ml-1 font-normal text-muted-foreground">(you)</span>
                        )}
                      </span>
                      <span
                        className="text-xs text-muted-foreground tabular"
                        title={`Strategy: ${r.strategy}`}
                      >
                        match {formatScore(r.score)}
                      </span>
                    </div>
                    {!!reasons.length && (
                      <ul className="mt-1.5 space-y-1">
                        {reasons.map((reason, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-1.5 text-xs text-muted-foreground"
                          >
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
                    <button
                      className={`${small} mt-2 ${current ? 'text-muted-foreground' : ''}`}
                      disabled={current || mutation.isPending}
                      onClick={() =>
                        mutation.mutate(
                          { action: 'assign', technicianId: r.technician.id },
                          { onSuccess: () => setOpen(false) },
                        )
                      }
                    >
                      {assignButtonLabel(r.technician.name, current, isSelf)}
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
export function DuplicatePanel({
  detail,
  suggestedDuplicateId,
}: {
  detail: IncidentDetail;
  suggestedDuplicateId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const list = useIncidents(`limit=200&serviceId=${detail.service.id}`);
  const mutation = useIncidentAction(detail.id);
  if (!detail.allowedActions.includes('closeAsDuplicate')) return null;
  const candidates = duplicateCandidates(detail, list.data ?? []);
  const target = resolveDuplicateTarget(
    selectedTarget,
    suggestedDuplicateId,
    candidates.map((c) => c.id),
  );
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
            if (!target) return;
            const main = e.currentTarget.closest('main');
            // mutateAsync: the panel hides once closed, which would drop mutate's callbacks.
            mutation
              .mutateAsync({ action: 'closeAsDuplicate', duplicateOfId: target })
              .then(() => {
                setOpen(false);
                setSelectedTarget(null);
                scrollPageToTop(main);
              })
              .catch(() => undefined);
          }}
        >
          <label className="block text-xs font-medium">
            Duplicate of
            <select
              value={target}
              onChange={(e) => setSelectedTarget(e.target.value)}
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
              onClick={() => {
                setOpen(false);
                setSelectedTarget(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
