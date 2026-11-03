import { BusinessRuleException } from './itsm-exception.js';
/** Raised when the reporter already has an open incident for the same problem. */
export class DuplicateIncidentException extends BusinessRuleException {
  readonly kind = 'conflict' as const;
  constructor(existingIncidentId: string) {
    super('DUPLICATE_INCIDENT', `Incident duplicates ${existingIncidentId}.`, {
      existingIncidentId,
    });
  }
}
