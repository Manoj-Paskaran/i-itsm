import { BusinessRuleException } from './itsm-exception.js';
/** Raised when a technician is already at their active-incident capacity. */
export class WorkloadExceededException extends BusinessRuleException {
  readonly kind = 'conflict' as const;
  constructor(technicianId: string, active: number, max: number) {
    super(
      'WORKLOAD_EXCEEDED',
      `Technician ${technicianId} has reached capacity (${active}/${max}).`,
      { technicianId, active, max },
    );
  }
}
