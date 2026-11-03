import type { Duration, IncidentId, Priority } from '../shared/index.js';
import type { EscalationLevel } from './escalation-level.js';
/** Value object carrying an escalation evaluation request. */
export class EscalationRequest {
  constructor(
    readonly incidentId: IncidentId,
    readonly priority: Priority,
    readonly currentLevel: EscalationLevel,
    readonly unacknowledgedFor: Duration,
  ) {
    Object.freeze(this);
  }
}
