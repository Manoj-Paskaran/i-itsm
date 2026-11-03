import { BusinessRuleException } from './itsm-exception.js';
/** Raised when no SLA policy covers a service and priority. */
export class MissingSlaConfigurationException extends BusinessRuleException {
  readonly kind = 'rule' as const;
  constructor(serviceId: string, priority: string) {
    super(
      'MISSING_SLA_CONFIGURATION',
      `No SLA configuration for service ${serviceId} and priority ${priority}.`,
      { serviceId, priority },
    );
  }
}
