import { humanizeLevels } from './incidents';
/** Severity follows the API event type, never words guessed from an incident title. */
export function notificationKind(eventType: string) {
  switch (eventType) {
    case 'SlaBreached':
      return 'breach';
    case 'SlaWarningRaised':
      return 'warning';
    case 'IncidentAssigned':
      return 'assignment';
    case 'IncidentEscalated':
      return 'escalation';
    case 'InfoRequested':
      return 'request';
    case 'IncidentResolved':
      return 'resolved';
    default:
      return 'update';
  }
}
export function notificationText(text: string) {
  return humanizeLevels(text).replace(/\bSLA approaching\b/g, 'SLA at risk');
}

/** Keep API chronology while gathering adjacent updates about the same incident. */
export function notificationRuns<T extends { incident: { id: string } | null }>(items: T[]): T[][] {
  const runs: T[][] = [];
  for (const item of items) {
    const last = runs.at(-1);
    if (item.incident && last?.[0]?.incident?.id === item.incident.id) last.push(item);
    else runs.push([item]);
  }
  return runs;
}
