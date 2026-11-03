import type { Category } from '../catalog/index.js';
import type { IncidentId, ItServiceId, Priority } from '../shared/index.js';
import type { TechnicianLoad } from './technician-load.js';

/** Value object carrying the inputs to an assignment strategy. */
export class AssignmentContext {
  readonly candidates: readonly TechnicianLoad[];
  constructor(
    readonly incidentId: IncidentId,
    readonly serviceId: ItServiceId,
    readonly priority: Priority,
    readonly category: Category,
    candidates: readonly TechnicianLoad[],
  ) {
    this.candidates = [...candidates];
  }
}
