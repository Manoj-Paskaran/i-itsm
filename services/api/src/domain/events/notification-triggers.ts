import { EventType } from './event-type.js';

export const SPEC_NOTIFICATION_TRIGGERS = {
  'Incident created': EventType.IncidentCreated,
  'Incident assigned': EventType.IncidentAssigned,
  'Priority changed': EventType.PriorityChanged,
  'Technician assigned': EventType.IncidentAssigned,
  'SLA approaching': EventType.SlaWarningRaised,
  'SLA violated': EventType.SlaBreached,
  'Incident resolved': EventType.IncidentResolved,
  'Incident closed': EventType.IncidentClosed,
} as const satisfies Readonly<Record<string, EventType>>;
