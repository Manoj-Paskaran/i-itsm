import { NotFoundException } from './itsm-exception.js';
/** Raised when an incident id does not exist. */
export class IncidentNotFoundException extends NotFoundException {
  constructor(incidentId: string) {
    super('INCIDENT_NOT_FOUND', `Incident ${incidentId} was not found.`, { incidentId });
  }
}
