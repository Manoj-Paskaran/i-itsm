import { BusinessRuleException } from './itsm-exception.js';
/** Raised when a lifecycle action is not allowed from the current state (State pattern guard). */
export class InvalidStateTransitionException extends BusinessRuleException {
  readonly kind = 'conflict' as const;
  constructor(from: string, action: string) {
    super('INVALID_STATE_TRANSITION', `Cannot ${action} an incident in state ${from}.`, {
      from,
      action,
    });
  }
}
