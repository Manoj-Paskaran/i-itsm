import { InvalidInputException, MissingSlaConfigurationException } from '../exceptions/index.js';
import type { ItServiceId, Priority } from '../shared/index.js';
import type { SlaPolicy } from './sla-policy.js';
import type { SlaTarget } from './sla-target.js';

export interface SlaTerms {
  readonly target: SlaTarget;
  readonly warningRatio: number;
}

/** Resolves one unambiguous policy with service-first, per-priority fallback. */
export class SlaCatalog {
  private readonly policies = new Map<ItServiceId | null, SlaPolicy>();

  constructor(policies: readonly SlaPolicy[]) {
    for (const policy of policies) {
      const serviceId = policy.serviceId();
      if (this.policies.has(serviceId))
        throw new InvalidInputException('Only one SLA policy is allowed per service or default.', {
          serviceId,
        });
      this.policies.set(serviceId, policy);
    }
  }

  resolve(serviceId: ItServiceId, priority: Priority): SlaTerms & { policy: SlaPolicy } {
    for (const key of [serviceId, null]) {
      const policy = this.policies.get(key);
      const target = policy?.targetFor(priority);
      if (policy && target) return { policy, target, warningRatio: policy.warningRatio };
    }
    throw new MissingSlaConfigurationException(serviceId, priority.value);
  }
}
