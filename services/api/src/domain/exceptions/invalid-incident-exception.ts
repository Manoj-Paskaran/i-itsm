import { BusinessRuleException } from './itsm-exception.js';
/** Raised when incident data breaks an incident invariant. */
export class InvalidIncidentException extends BusinessRuleException {
  readonly kind = 'rule' as const;
  constructor(reason: string) {
    super('INVALID_INCIDENT', `Invalid incident: ${reason}.`, { reason });
  }
}
