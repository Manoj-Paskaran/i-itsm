import type { Technician } from '../users/index.js';
import { numberIn } from '../shared/validation.js';

/** Value object pairing a technician with their active workload. */
export class TechnicianLoad {
  readonly activeIncidents: number;
  constructor(
    readonly technician: Technician,
    activeIncidents: number,
  ) {
    this.activeIncidents = numberIn(
      activeIncidents,
      'activeIncidents',
      0,
      Number.MAX_SAFE_INTEGER,
      true,
    );
  }
  loadRatio(): number {
    return Math.min(1, this.activeIncidents / this.technician.capacity());
  }
}
