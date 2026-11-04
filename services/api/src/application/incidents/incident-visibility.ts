import type { Incident } from '../../domain/incidents/index.js';
import { Permission as P, type User } from '../../domain/users/index.js';

/** One rule for "who may see this incident", shared by detail views, commands and insights. */
export const IncidentVisibility = {
  canView(user: User, incident: Incident): boolean {
    return (
      user.isActive() &&
      (user.can(P.INCIDENT_VIEW_ALL) ||
        incident.reporterId() === user.id() ||
        incident.assigneeId() === user.id())
    );
  },
};
