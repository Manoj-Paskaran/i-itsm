import type { IncidentDetail } from '@itsm/contracts';
import { formatRationale } from '@/lib/incidents';
import { parsePriorityRationale } from '@/lib/priority-rationale';
import { PriorityChip } from './chips';

export function PriorityCalculation({ detail }: { detail: IncidentDetail }) {
  const calculation = parsePriorityRationale(detail.priorityRationale);
  if (!calculation || calculation.priority !== detail.priority)
    return (
      <>
        <PriorityChip priority={detail.priority} />
        {!!detail.priorityRationale.length && (
          <ul className="mt-2 space-y-2 text-xs leading-5 tabular">
            {detail.priorityRationale.map((line, i) => (
              <li key={i}>{formatRationale(line)}</li>
            ))}
          </ul>
        )}
      </>
    );
  const c = calculation;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background text-xs tabular">
      <dl className="space-y-2 p-3">
        {c.terms.map((term) => (
          <div key={term.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <dt>
              <span className="block text-muted-foreground">{term.label}</span>
              <span className="font-medium">{term.name}</span>
            </dt>
            <dd className="text-base font-semibold">{term.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mx-3 flex items-center justify-between border-t border-border py-2">
        <span>{c.terms.map((term) => term.value).join(' × ')}</span>
        <strong className="text-base">= {c.base}</strong>
      </div>
      <div className="flex items-center justify-between gap-2 bg-panel px-3 py-2">
        <span>{c.users.toLocaleString('en-IN')} affected users</span>
        <span className="text-sm font-semibold">× {c.multiplier}</span>
      </div>
      <div className="space-y-2 border-t border-border p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">Final score</span>
          <strong className="text-2xl">{c.score.toFixed(1)}</strong>
        </div>
        <p className="text-muted-foreground">
          {c.base} × {c.multiplier} = {c.score.toFixed(1)} · {c.comparison} {c.threshold} (
          {c.priority === 'P4' ? 'P3 threshold' : `${c.priority} threshold`})
        </p>
        <PriorityChip priority={detail.priority} />
      </div>
    </div>
  );
}
