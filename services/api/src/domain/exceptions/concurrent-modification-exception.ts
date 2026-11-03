import { BusinessRuleException } from './itsm-exception.js';

/** A persisted aggregate changed since this instance was loaded. */
export class ConcurrentModificationException extends BusinessRuleException {
  readonly kind = 'conflict' as const;
  constructor(incidentId: string) {
    super('CONCURRENT_MODIFICATION', 'Incident was modified concurrently.', { incidentId });
  }
}
