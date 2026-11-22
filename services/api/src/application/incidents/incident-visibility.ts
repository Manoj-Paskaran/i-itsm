import type { Incident } from '../../domain/incidents/index.js';
import { Permission as P, Role, type User } from '../../domain/users/index.js';

/** Access rules for incidents and their internal notes. */
export const IncidentVisibility = {
  canView(user: User, incident: Incident): boolean {
    return (
      user.isActive() &&
      (user.can(P.INCIDENT_VIEW_ALL) ||
        incident.reporterId() === user.id() ||
        incident.assigneeId() === user.id())
    );
  },
  /** Investigation notes are internal: an employee sees only the notes they wrote themselves. */
  canViewNote(user: User, authorId: string | null | undefined): boolean {
    return user.role() !== Role.EMPLOYEE || authorId === user.id();
  },
};
