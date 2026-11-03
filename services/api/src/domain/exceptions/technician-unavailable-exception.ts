import { BusinessRuleException } from './itsm-exception.js';
/** Raised when no suitable technician is available to take an incident. */
export class TechnicianUnavailableException extends BusinessRuleException {
  readonly kind = 'conflict' as const;
  constructor(reason?: string) {
    super(
      'TECHNICIAN_UNAVAILABLE',
      reason ? `Technician unavailable: ${reason}.` : 'Technician is unavailable.',
      { reason },
    );
  }
}
