export const EventType = {
  IncidentCreated: 'IncidentCreated',
  IncidentClassified: 'IncidentClassified',
  PriorityChanged: 'PriorityChanged',
  IncidentAssigned: 'IncidentAssigned',
  IncidentAcknowledged: 'IncidentAcknowledged',
  WorkStarted: 'WorkStarted',
  NoteAdded: 'NoteAdded',
  InfoRequested: 'InfoRequested',
  InfoProvided: 'InfoProvided',
  IncidentResolved: 'IncidentResolved',
  IncidentVerified: 'IncidentVerified',
  IncidentReopened: 'IncidentReopened',
  IncidentClosed: 'IncidentClosed',
  FeedbackGiven: 'FeedbackGiven',
  SlaBreached: 'SlaBreached',
  SlaWarningRaised: 'SlaWarningRaised',
  IncidentEscalated: 'IncidentEscalated',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];
export const ALL_EVENT_TYPES: readonly EventType[] = Object.freeze(Object.values(EventType));
