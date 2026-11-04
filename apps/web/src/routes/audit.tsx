import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { StatusPill } from '@/components/incident/chips';
import { auditSearch, labelIds, useAudit } from '@/lib/admin';
import {
  humanizeAudit,
  useCategories,
  useIncidents,
  useServices,
  useTechnicians,
} from '@/lib/incidents';

export const Route = createFileRoute('/audit')({ component: Audit });

const ACTIONS = [
  'IncidentCreated',
  'IncidentClassified',
  'IncidentAssigned',
  'IncidentAcknowledged',
  'WorkStarted',
  'InfoRequested',
  'InfoProvided',
  'IncidentResolved',
  'IncidentVerified',
  'IncidentReopened',
  'IncidentClosed',
  'SlaWarningRaised',
  'SlaBreached',
  'IncidentEscalated',
  'PriorityChanged',
  'NoteAdded',
  'FeedbackGiven',
];
const words = (action: string) => action.replace(/([a-z])([A-Z])/g, '$1 $2');
const input = 'h-8 rounded-md border border-input bg-background px-2 text-sm';

function Audit() {
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const audit = useAudit(auditSearch({ action, from, to }));
  const labels = useAuditLabels();
  return (
    <AppShell>
      <header className="border-b border-border px-8 pt-5 pb-4 max-sm:px-4">
        <h1 className="text-xl font-semibold">Audit trail</h1>
        <p className="text-sm text-muted-foreground">
          Every state change, assignment, SLA event and escalation, newest first. The trail is
          insert-only.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <select
            aria-label="Action"
            className={input}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">Any action</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {words(a)}
              </option>
            ))}
          </select>
          <label className="text-xs text-muted-foreground">
            From{' '}
            <input
              type="date"
              className={input}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            To{' '}
            <input
              type="date"
              className={input}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <span className="ml-auto text-xs text-muted-foreground tabular">
            {audit.data ? `${audit.data.length} entries (latest 200)` : ''}
          </span>
        </div>
      </header>
      <div className="px-8 py-5 max-sm:px-4">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-panel text-left text-xs text-muted-foreground">
              <tr>
                {['When', 'Incident', 'Action', 'What happened', 'By'].map((h) => (
                  <th key={h} className="px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {audit.isLoading ? (
                <tr>
                  <td colSpan={5} className="p-4">
                    <div className="h-6 animate-pulse rounded bg-muted" />
                  </td>
                </tr>
              ) : audit.isError ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-critical-foreground">
                    {audit.error.message}
                  </td>
                </tr>
              ) : audit.data?.length ? (
                audit.data.map((e, i) => (
                  <tr key={`${e.at}-${i}`} className="border-t border-border align-top">
                    <td className="px-4 py-2 text-xs whitespace-nowrap text-muted-foreground tabular">
                      {new Date(e.at).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-2 tabular">
                      <Link
                        to="/incidents/$incidentId"
                        params={{ incidentId: e.incident.id }}
                        className="font-medium"
                      >
                        {e.incident.number}
                      </Link>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className="text-xs font-medium">{words(e.action)}</span>
                      {e.toStatus && e.fromStatus !== e.toStatus && (
                        <div className="mt-1">
                          <StatusPill status={e.toStatus} small />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {humanizeAudit(
                        labelIds(
                          e.description.replace(e.incident.id, e.incident.number),
                          e.actor
                            ? new Map([...labels, [e.actor.id.toLowerCase(), e.actor.name]])
                            : labels,
                        ),
                        e.incident.number,
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {e.actor?.name ?? 'System'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No audit entries match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

/** Names for the ids the audit search returns: technicians, services, categories, incident numbers. */
function useAuditLabels() {
  const technicians = useTechnicians(true);
  const services = useServices();
  const categories = useCategories();
  const incidents = useIncidents('limit=200');
  const map = new Map<string, string>();
  for (const t of technicians.data ?? []) map.set(t.id.toLowerCase(), t.name);
  for (const s of services.data ?? []) map.set(s.id.toLowerCase(), s.name);
  for (const c of categories.data ?? []) map.set(c.id.toLowerCase(), c.name);
  for (const i of incidents.data ?? []) {
    map.set(i.id.toLowerCase(), i.number);
    map.set(i.reporter.id.toLowerCase(), i.reporter.name);
    if (i.assignee) map.set(i.assignee.id.toLowerCase(), i.assignee.name);
  }
  return map;
}
