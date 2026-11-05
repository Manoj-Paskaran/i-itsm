import { BusinessRuleException } from './itsm-exception.js';
/** Raised when the reporter already has an open incident for the same problem. */
export class DuplicateIncidentException extends BusinessRuleException {
  readonly kind = 'conflict' as const;
  constructor(existingIncidentId: string, existingNumber?: string) {
    super(
      'DUPLICATE_INCIDENT',
      existingNumber
        ? `You already reported this problem as ${existingNumber}, and it is still open.`
        : 'You already reported this problem, and it is still open.',
      { existingIncidentId, ...(existingNumber ? { existingNumber } : {}) },
    );
  }
}
